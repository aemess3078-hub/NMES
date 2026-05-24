"use server"

import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"
import { createFinishedGoodsLot } from "./finished-goods-lot.helpers"

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkOrderForReceipt = {
  id: string
  orderNo: string
  manufacturingNo: string | null
  status: string
  dueDate: Date | null
  plannedQty: number
  item: { id: string; code: string; name: string; uom: string }
  site: { id: string; name: string }
  totalGoodQty: number
  totalReceiptQty: number
  pendingQty: number
  latestInspectionResult: "PASS" | "FAIL" | "CONDITIONAL" | null
  // WipUnit 진행 상태 — 입고 가능 여부 판단 보조용. null 이면 WIP 추적 없는 레거시 작업지시.
  wipUnitStatus: string | null
  receipts: {
    id: string
    receiptQty: number
    receiptAt: Date
    lotNo: string | null
    warehouse: { id: string; name: string }
    location: { id: string; name: string }
  }[]
}

export type WarehouseWithLocations = {
  id: string
  code: string
  name: string
  locations: { id: string; code: string; name: string }[]
}

export type CreateReceiptInput = {
  workOrderId: string
  itemId: string
  siteId: string
  warehouseId: string
  locationId: string
  receiptQty: number
  lotId?: string | null
}

// ─── COMPLETED WorkOrder 목록 조회 ──────────────────────────────────────────

export async function getWorkOrdersForReceipt(
  tenantId: string
): Promise<WorkOrderForReceipt[]> {
  const workOrders = await prisma.workOrder.findMany({
    where: { tenantId, status: "COMPLETED" },
    include: {
      item: { select: { id: true, code: true, name: true, uom: true } },
      site: { select: { id: true, name: true } },
      operations: {
        include: {
          productionResults: {
            select: { goodQty: true },
          },
          qualityInspections: {
            select: { result: true, inspectedAt: true },
            orderBy: { inspectedAt: "desc" },
            take: 1,
          },
        },
        orderBy: { seq: "desc" },
      },
      finishedGoodsReceipts: {
        include: {
          warehouse: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
          lot: { select: { id: true, lotNo: true } },
        },
        orderBy: { receiptAt: "desc" },
      },
      // 루트 WipUnit(parent/source가 없는 것) 1건만 가져와 입고 가능 여부 판단.
      wipUnits: {
        where: { parentWipUnitId: null, sourceProductionResultId: null },
        select: { id: true, status: true },
        orderBy: [{ updatedAt: "desc" }],
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
  })

  return workOrders.map((wo) => {
    const totalGoodQty = wo.operations.reduce((sum, op) => {
      return (
        sum +
        op.productionResults.reduce((s, r) => s + Number(r.goodQty), 0)
      )
    }, 0)

    const totalReceiptQty = wo.finishedGoodsReceipts.reduce(
      (sum, r) => sum + Number(r.receiptQty),
      0
    )

    // 가장 최근 공정(마지막 seq)의 검사 결과
    const latestInspection = wo.operations
      .flatMap((op) => op.qualityInspections)
      .sort((a, b) => new Date(b.inspectedAt).getTime() - new Date(a.inspectedAt).getTime())[0]

    return {
      id: wo.id,
      orderNo: wo.orderNo,
      manufacturingNo: wo.manufacturingNo,
      status: wo.status,
      dueDate: wo.dueDate,
      plannedQty: Number(wo.plannedQty),
      item: wo.item,
      site: wo.site,
      totalGoodQty,
      totalReceiptQty,
      pendingQty: Math.max(0, totalGoodQty - totalReceiptQty),
      latestInspectionResult: (latestInspection?.result as WorkOrderForReceipt["latestInspectionResult"]) ?? null,
      wipUnitStatus: wo.wipUnits[0]?.status ?? null,
      receipts: wo.finishedGoodsReceipts.map((r) => ({
        id: r.id,
        receiptQty: Number(r.receiptQty),
        receiptAt: r.receiptAt,
        lotNo: r.lot?.lotNo ?? null,
        warehouse: r.warehouse,
        location: r.location,
      })),
    }
  })
}

// ─── 완제품 창고 + 로케이션 목록 ────────────────────────────────────────────

export async function getFinishedGoodsWarehouses(
  tenantId: string
): Promise<WarehouseWithLocations[]> {
  const warehouses = await prisma.warehouse.findMany({
    where: { tenantId },
    include: {
      locations: {
        select: { id: true, code: true, name: true },
        orderBy: { code: "asc" },
      },
    },
    orderBy: { name: "asc" },
  })

  return warehouses.map((wh) => ({
    id: wh.id,
    code: wh.code,
    name: wh.name,
    locations: wh.locations,
  }))
}

// ─── 완제품 입고 처리 ─────────────────────────────────────────────────────────

async function generateReceiptTxNo(tenantId: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const count = await prisma.inventoryTransaction.count({
    where: { tenantId, txNo: { startsWith: `RCP-${today}` } },
  })
  return `RCP-${today}-${String(count + 1).padStart(4, "0")}`
}

export async function createFinishedGoodsReceiptAction(
  data: CreateReceiptInput,
  tenantId: string
): Promise<{ ok: boolean; error?: string; lotNo?: string }> {
  try {
    let createdLotNo: string | null = null

    await prisma.$transaction(async (tx) => {
      // 1. WorkOrder 재조회 (입고 가능 수량 / WipUnit 상태 / 완제품 LOT 발번 정보)
      const workOrder = await tx.workOrder.findFirst({
        where: { id: data.workOrderId, tenantId },
        include: {
          operations: {
            select: {
              productionResults: { select: { goodQty: true } },
            },
          },
          finishedGoodsReceipts: { select: { receiptQty: true } },
          wipUnits: {
            where: { parentWipUnitId: null, sourceProductionResultId: null },
            select: { id: true, status: true, lotId: true },
            orderBy: [{ updatedAt: "desc" }],
            take: 1,
          },
        },
      })

      if (!workOrder) {
        throw new Error("작업지시를 찾을 수 없습니다.")
      }
      if (workOrder.itemId !== data.itemId) {
        throw new Error("작업지시 품목과 입고 품목이 일치하지 않습니다.")
      }

      // 2. WipUnit 검증 — WipUnit 이 있으면 COMPLETED 만 허용. 없으면 레거시 호환.
      const rootWipUnit = workOrder.wipUnits[0] ?? null
      if (rootWipUnit && rootWipUnit.status !== "COMPLETED") {
        throw new Error(
          `WipUnit 상태가 COMPLETED 가 아닙니다 (현재 ${rootWipUnit.status}). 마지막 공정을 완료한 뒤 입고하세요.`,
        )
      }
      if (!rootWipUnit) {
        console.warn(
          `[finished-goods] WipUnit not found for workOrderId=${workOrder.id} — 레거시 작업지시로 간주하고 입고 진행`,
        )
      }

      // 3. pendingQty 재계산 — UI max 신뢰하지 않고 서버에서 다시 검증
      const totalGoodQty = workOrder.operations.reduce(
        (s, op) => s + op.productionResults.reduce((a, r) => a + Number(r.goodQty), 0),
        0,
      )
      const totalReceiptQty = workOrder.finishedGoodsReceipts.reduce(
        (s, r) => s + Number(r.receiptQty),
        0,
      )
      const pendingQty = Math.max(0, totalGoodQty - totalReceiptQty)
      if (data.receiptQty <= 0) {
        throw new Error("입고 수량은 0보다 커야 합니다.")
      }
      if (data.receiptQty > pendingQty) {
        throw new Error(
          `입고 수량(${data.receiptQty})이 입고 가능 수량(${pendingQty})을 초과합니다.`,
        )
      }

      // 4. 완제품 Lot 발번 — 부분입고 다회차마다 신규 Lot 발번 (의료기기 추적성)
      const lot = await createFinishedGoodsLot(tx, {
        tenantId,
        workOrder: {
          orderNo: workOrder.orderNo,
          manufacturingNo: workOrder.manufacturingNo,
          itemId: workOrder.itemId,
        },
      })
      createdLotNo = lot.lotNo

      // 5. WipUnit.lotId 갱신 — 최초 LOT 만 연결 (다회차는 FinishedGoodsReceipt 로 추적).
      //    WipUnit 1건에는 단일 lotId 만 표현 가능하므로, 다회차 LOT 는 추적성 화면에서
      //    finishedGoodsReceipts 배열로 확인한다.
      if (rootWipUnit && rootWipUnit.lotId == null) {
        await tx.wipUnit.update({
          where: { id: rootWipUnit.id },
          data: { lotId: lot.id },
        })
      }

      // 6. FinishedGoodsReceipt 생성 (lotId 연결)
      await tx.finishedGoodsReceipt.create({
        data: {
          tenantId,
          siteId: data.siteId,
          workOrderId: data.workOrderId,
          itemId: data.itemId,
          lotId: lot.id,
          warehouseId: data.warehouseId,
          locationId: data.locationId,
          receiptQty: data.receiptQty,
          receiptAt: new Date(),
        },
      })

      // 7. InventoryTransaction (RECEIPT) 생성 — lotId 연결
      //    NOTE: 기존 코드가 toLocationId 에 warehouseId 를 넣어왔다 (schema 관계상 Warehouse 매핑).
      //    명명 혼란이 있으나 이번 Phase 에서는 호환성 유지 위해 동일 동작 유지.
      const txNo = await generateReceiptTxNo(tenantId)
      await tx.inventoryTransaction.create({
        data: {
          tenantId,
          itemId: data.itemId,
          lotId: lot.id,
          toLocationId: data.warehouseId,
          txNo,
          txType: "RECEIPT",
          qty: data.receiptQty,
          refType: "WORK_ORDER",
          refId: data.workOrderId,
          note: "완제품 입고 처리",
          txAt: new Date(),
        },
      })

      // 8. InventoryBalance — lotId 포함 키로 upsert. 새 LOT 이면 신규 row 생성.
      const existing = await tx.inventoryBalance.findFirst({
        where: {
          tenantId,
          siteId: data.siteId,
          warehouseId: data.warehouseId,
          itemId: data.itemId,
          lotId: lot.id,
        },
      })

      if (existing) {
        const newQty = Number(existing.qtyOnHand) + data.receiptQty
        await tx.inventoryBalance.update({
          where: { id: existing.id },
          data: {
            qtyOnHand: newQty,
            qtyAvailable: newQty - Number(existing.qtyHold),
          },
        })
      } else {
        await tx.inventoryBalance.create({
          data: {
            tenantId,
            siteId: data.siteId,
            warehouseId: data.warehouseId,
            itemId: data.itemId,
            lotId: lot.id,
            qtyOnHand: data.receiptQty,
            qtyAvailable: data.receiptQty,
            qtyHold: 0,
          },
        })
      }
    })

    revalidatePath("/app/mes/finished-goods-receipt")
    revalidatePath("/app/mes/inventory")
    revalidatePath("/app/mes/inventory-transactions")
    revalidatePath("/app/mes/manufacturing-traceability")
    return { ok: true, lotNo: createdLotNo ?? undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "오류가 발생했습니다." }
  }
}
