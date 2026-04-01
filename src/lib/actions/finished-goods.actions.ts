"use server"

import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkOrderForReceipt = {
  id: string
  orderNo: string
  status: string
  dueDate: Date | null
  plannedQty: number
  item: { id: string; code: string; name: string; uom: string }
  site: { id: string; name: string }
  totalGoodQty: number
  totalReceiptQty: number
  pendingQty: number
  latestInspectionResult: "PASS" | "FAIL" | "CONDITIONAL" | null
  receipts: {
    id: string
    receiptQty: number
    receiptAt: Date
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
        },
        orderBy: { receiptAt: "desc" },
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
      status: wo.status,
      dueDate: wo.dueDate,
      plannedQty: Number(wo.plannedQty),
      item: wo.item,
      site: wo.site,
      totalGoodQty,
      totalReceiptQty,
      pendingQty: Math.max(0, totalGoodQty - totalReceiptQty),
      latestInspectionResult: (latestInspection?.result as WorkOrderForReceipt["latestInspectionResult"]) ?? null,
      receipts: wo.finishedGoodsReceipts.map((r) => ({
        id: r.id,
        receiptQty: Number(r.receiptQty),
        receiptAt: r.receiptAt,
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
): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      // 1. FinishedGoodsReceipt 생성
      await tx.finishedGoodsReceipt.create({
        data: {
          tenantId,
          siteId: data.siteId,
          workOrderId: data.workOrderId,
          itemId: data.itemId,
          lotId: data.lotId ?? null,
          warehouseId: data.warehouseId,
          locationId: data.locationId,
          receiptQty: data.receiptQty,
          receiptAt: new Date(),
        },
      })

      // 2. InventoryTransaction (RECEIPT) 생성
      const txNo = await generateReceiptTxNo(tenantId)
      await tx.inventoryTransaction.create({
        data: {
          tenantId,
          itemId: data.itemId,
          lotId: data.lotId ?? null,
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

      // 3. InventoryBalance 갱신
      const existing = await tx.inventoryBalance.findFirst({
        where: {
          tenantId,
          siteId: data.siteId,
          warehouseId: data.warehouseId,
          itemId: data.itemId,
          lotId: data.lotId ?? null,
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
            lotId: data.lotId ?? null,
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
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "오류가 발생했습니다." }
  }
}
