"use server"

import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"

// ─── Types ────────────────────────────────────────────────────────────────────

export type MaterialRequirement = {
  itemId: string
  item: { id: string; code: string; name: string; uom: string; spec: string | null; isLotTracked: boolean }
  requiredQty: number
  issuedQty: number
  pendingQty: number
  currentStock: number        // 전체 창고 합산 가용재고
  reservationId: string | null
}

export type LotStockOption = {
  lotId: string
  lotNo: string
  qtyAvailable: number
  unit: string
}

export type WorkOrderForIssue = {
  id: string
  orderNo: string
  status: string
  plannedQty: number
  dueDate: Date | null
  manufacturingNo: string | null
  item: { id: string; code: string; name: string }
  site: { id: string; name: string }
  materials: MaterialRequirement[]
  allIssued: boolean
}

export type WarehouseStockOption = {
  id: string
  code: string
  name: string
  itemStocks: Record<string, number>   // itemId → qtyAvailable
}

export type IssueMaterialInput = {
  workOrderId: string
  siteId: string
  warehouseId?: string
  items: {
    itemId: string
    warehouseId?: string
    lotId?: string | null      // LOT 관리 품목은 필수, 비관리 품목은 null/undefined
    issueQty: number
    requiredQty: number
    reservationId: string | null
  }[]
}

// ─── 자재출고 대상 WorkOrder 조회 ─────────────────────────────────────────────

export async function getWorkOrdersForIssue(
  tenantId: string
): Promise<WorkOrderForIssue[]> {
  const workOrders = await prisma.workOrder.findMany({
    where: {
      tenantId,
      status: { in: ["RELEASED", "IN_PROGRESS"] },
    },
    include: {
      item: { select: { id: true, code: true, name: true } },
      site: { select: { id: true, name: true } },
      bom: {
        include: {
          bomItems: {
            include: {
              componentItem: {
                select: { id: true, code: true, name: true, uom: true, spec: true, isLotTracked: true },
              },
            },
            orderBy: { seq: "asc" },
          },
        },
      },
      materialReservations: true,
    },
    orderBy: [{ dueDate: "asc" }, { orderNo: "asc" }],
  })

  // 전체 필요 품목 ID 수집 → 재고 일괄 조회
  const allItemIdSet = new Set(
    workOrders.flatMap((wo) => wo.bom.bomItems.map((bi) => bi.componentItemId))
  )
  const allItemIds = Array.from(allItemIdSet)

  const balances = await prisma.inventoryBalance.findMany({
    where: { tenantId, itemId: { in: allItemIds } },
    select: { itemId: true, qtyAvailable: true },
  })

  const stockMap = new Map<string, number>()
  for (const b of balances) {
    stockMap.set(
      b.itemId,
      (stockMap.get(b.itemId) ?? 0) + Number(b.qtyAvailable)
    )
  }

  return workOrders.map((wo) => {
    const plannedQty = Number(wo.plannedQty)

    const materials: MaterialRequirement[] = wo.bom.bomItems.map((bi) => {
      const baseQty = Number(bi.qtyPer) * plannedQty
      const requiredQty = Math.round(baseQty * (1 + Number(bi.scrapRate)) * 1000) / 1000
      const reservation = wo.materialReservations.find(
        (r) => r.itemId === bi.componentItemId
      )
      const issuedQty = reservation ? Number(reservation.issuedQty) : 0

      return {
        itemId: bi.componentItemId,
        item: bi.componentItem,
        requiredQty,
        issuedQty,
        pendingQty: Math.max(0, requiredQty - issuedQty),
        currentStock: stockMap.get(bi.componentItemId) ?? 0,
        reservationId: reservation?.id ?? null,
      }
    })

    return {
      id: wo.id,
      orderNo: wo.orderNo,
      status: wo.status,
      plannedQty,
      dueDate: wo.dueDate,
      manufacturingNo: wo.manufacturingNo,
      item: wo.item,
      site: wo.site,
      materials,
      allIssued: materials.length > 0 && materials.every((m) => m.pendingQty <= 0),
    }
  })
}

// ─── 창고 목록 (재고 포함) ─────────────────────────────────────────────────────

export async function getWarehousesWithStock(
  tenantId: string,
  itemIds: string[]
): Promise<WarehouseStockOption[]> {
  const warehouses = await prisma.warehouse.findMany({
    where: { tenantId },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  })

  if (itemIds.length === 0) {
    return warehouses.map((wh) => ({ ...wh, itemStocks: {} }))
  }

  const balances = await prisma.inventoryBalance.findMany({
    where: { tenantId, warehouseId: { in: warehouses.map((wh) => wh.id) }, itemId: { in: itemIds } },
    select: { warehouseId: true, itemId: true, qtyAvailable: true },
  })

  return warehouses.map((wh) => {
    const itemStocks: Record<string, number> = {}
    for (const b of balances.filter((b) => b.warehouseId === wh.id)) {
      itemStocks[b.itemId] = (itemStocks[b.itemId] ?? 0) + Number(b.qtyAvailable)
    }
    return { ...wh, itemStocks }
  })
}

// ─── LOT별 재고 조회 (창고 + 품목 지정) ──────────────────────────────────────

export async function getLotStockByWarehouse(
  warehouseId: string,
  itemIds: string[],
  tenantId: string
): Promise<Record<string, LotStockOption[]>> {
  if (itemIds.length === 0) return {}

  const balances = await prisma.inventoryBalance.findMany({
    where: {
      tenantId,
      warehouseId,
      itemId: { in: itemIds },
      lotId: { not: null },
    },
    include: {
      lot: { select: { id: true, lotNo: true } },
      item: { select: { uom: true } },
    },
    orderBy: { lot: { lotNo: "asc" } },
  })

  const result: Record<string, LotStockOption[]> = {}
  for (const b of balances) {
    if (!b.lot || Number(b.qtyAvailable) <= 0) continue
    if (!result[b.itemId]) result[b.itemId] = []
    result[b.itemId].push({
      lotId: b.lot.id,
      lotNo: b.lot.lotNo,
      qtyAvailable: Number(b.qtyAvailable),
      unit: b.item.uom,
    })
  }
  return result
}

// ─── txNo 생성 헬퍼 (트랜잭션 외부에서 호출) ─────────────────────────────────

async function generateIssueTxNo(tenantId: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const count = await prisma.inventoryTransaction.count({
    where: { tenantId, txNo: { startsWith: `ISS-${today}` } },
  })
  return `ISS-${today}-${String(count + 1).padStart(4, "0")}`
}

// ─── 자재출고 처리 ─────────────────────────────────────────────────────────────

export async function issueMaterialsForWorkOrder(
  data: IssueMaterialInput,
  tenantId: string
): Promise<{ ok: boolean; error?: string }> {
  const activeItems = data.items.filter((i) => i.issueQty > 0)
  if (activeItems.length === 0)
    return { ok: false, error: "출고 수량을 입력하세요." }

  // LOT 관리 여부 일괄 조회 (트랜잭션 외부 — 읽기 전용)
  const itemRecords = await prisma.item.findMany({
    where: { id: { in: activeItems.map((i) => i.itemId) } },
    select: { id: true, code: true, uom: true, isLotTracked: true },
  })
  const itemMetaMap = new Map(itemRecords.map((r) => [r.id, r]))

  // 작업지시의 제조번호 조회 (의료기기 추적성 연결용)
  const workOrder = await prisma.workOrder.findUnique({
    where: { id: data.workOrderId },
    select: { manufacturingNo: true },
  })

  // txNo 사전 생성 (트랜잭션 외부)
  const txNos: string[] = []
  for (let i = 0; i < activeItems.length; i++) {
    txNos.push(await generateIssueTxNo(tenantId))
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < activeItems.length; i++) {
        const item = activeItems[i]
        const txNo = txNos[i]
        const meta = itemMetaMap.get(item.itemId)
        const warehouseId = item.warehouseId ?? data.warehouseId
        if (!warehouseId) {
          throw new Error(
            `출고 창고 미선택: ${meta?.code ?? item.itemId} 품목의 출고 창고를 선택하세요.`
          )
        }

        // ── LOT 결정 ──────────────────────────────────────────────────────────
        let lotId: string | null = null
        if (meta?.isLotTracked) {
          if (!item.lotId) {
            throw new Error(
              `LOT 관리 품목(${meta.code})은 출고 시 LOT를 지정해야 합니다.`
            )
          }
          lotId = item.lotId
        }
        // 비LOT 품목: lotId = null (partial unique index가 단일 row를 보장)

        // ── 1. InventoryBalance 조회 (lotId 포함) ────────────────────────────
        const balance = await tx.inventoryBalance.findFirst({
          where: {
            tenantId,
            warehouseId,
            itemId: item.itemId,
            lotId,
          },
        })

        if (!balance) {
          const lotInfo = lotId ? ` LOT(${item.lotId})` : ""
          throw new Error(
            `재고 없음: 해당 창고에 ${meta?.code ?? item.itemId}${lotInfo} 재고가 없습니다.`
          )
        }

        const newQty = Number(balance.qtyOnHand) - item.issueQty
        if (newQty < 0) {
          const lotInfo = lotId ? ` LOT(${item.lotId})` : ""
          throw new Error(
            `재고 부족: ${meta?.code ?? item.itemId}${lotInfo} — 현재 재고 ${Number(balance.qtyOnHand)}, 출고 요청 ${item.issueQty}`
          )
        }

        // ── 2. InventoryTransaction 기록 (lotId 포함) ────────────────────────
        const inventoryTx = await tx.inventoryTransaction.create({
          data: {
            tenantId,
            itemId: item.itemId,
            lotId,
            fromLocationId: warehouseId,
            txNo,
            txType: "ISSUE",
            qty: item.issueQty,
            refType: "WORK_ORDER",
            refId: data.workOrderId,
            note: "자재출고 처리",
            txAt: new Date(),
          },
        })

        // ── 2-1. WorkOrderMaterialLot (의료기기 추적성: 제조번호↔원자재 LOT)
        //        LOT 관리 품목 + LOT 지정된 경우에만 기록
        if (lotId) {
          const lotRecord = await tx.lot.findUnique({
            where: { id: lotId },
            select: { lotNo: true },
          })
          if (lotRecord) {
            await tx.workOrderMaterialLot.create({
              data: {
                tenantId,
                workOrderId: data.workOrderId,
                manufacturingNo: workOrder?.manufacturingNo ?? null,
                materialItemId: item.itemId,
                materialLotNo: lotRecord.lotNo,
                qty: item.issueQty,
                unit: meta?.uom ?? null,
                issuedAt: new Date(),
                inventoryTransactionId: inventoryTx.id,
              },
            })
          }
        }

        // ── 3. InventoryBalance 차감 ─────────────────────────────────────────
        await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: {
            qtyOnHand: newQty,
            qtyAvailable: Math.max(0, newQty - Number(balance.qtyHold)),
          },
        })

        // ── 4. MaterialReservation 갱신 ──────────────────────────────────────
        if (item.reservationId) {
          const res = await tx.materialReservation.findUnique({
            where: { id: item.reservationId },
          })
          if (res) {
            const newIssuedQty = Number(res.issuedQty) + item.issueQty
            await tx.materialReservation.update({
              where: { id: item.reservationId },
              data: {
                issuedQty: newIssuedQty,
                status:
                  newIssuedQty >= Number(res.requiredQty)
                    ? "FULFILLED"
                    : "PARTIAL",
              },
            })
          }
        } else {
          const existing = await tx.materialReservation.findFirst({
            where: { workOrderId: data.workOrderId, itemId: item.itemId },
          })
          if (existing) {
            const newIssuedQty = Number(existing.issuedQty) + item.issueQty
            await tx.materialReservation.update({
              where: { id: existing.id },
              data: {
                issuedQty: newIssuedQty,
                status:
                  newIssuedQty >= Number(existing.requiredQty)
                    ? "FULFILLED"
                    : "PARTIAL",
              },
            })
          } else {
            await tx.materialReservation.create({
              data: {
                workOrderId: data.workOrderId,
                itemId: item.itemId,
                requiredQty: item.requiredQty,
                reservedQty: 0,
                issuedQty: item.issueQty,
                status:
                  item.issueQty >= item.requiredQty ? "FULFILLED" : "PARTIAL",
              },
            })
          }
        }
      }
    })

    revalidatePath("/app/mes/material-issue")
    revalidatePath("/app/mes/inventory")
    revalidatePath("/app/mes/material/stock")
    revalidatePath("/app/mes/inventory-transactions")
    revalidatePath("/app/mes/manufacturing-traceability")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "오류가 발생했습니다." }
  }
}
