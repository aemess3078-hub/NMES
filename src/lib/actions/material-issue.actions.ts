"use server"

import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"

// ─── Types ────────────────────────────────────────────────────────────────────

export type MaterialRequirement = {
  itemId: string
  item: { id: string; code: string; name: string; uom: string }
  requiredQty: number
  issuedQty: number
  pendingQty: number
  currentStock: number        // 전체 창고 합산 가용재고
  reservationId: string | null
}

export type WorkOrderForIssue = {
  id: string
  orderNo: string
  status: string
  plannedQty: number
  dueDate: Date | null
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
  warehouseId: string
  items: {
    itemId: string
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
                select: { id: true, code: true, name: true, uom: true },
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

        // 1. InventoryTransaction (ISSUE)
        await tx.inventoryTransaction.create({
          data: {
            tenantId,
            itemId: item.itemId,
            fromLocationId: data.warehouseId,
            txNo,
            txType: "ISSUE",
            qty: item.issueQty,
            refType: "WORK_ORDER",
            refId: data.workOrderId,
            note: "자재출고 처리",
            txAt: new Date(),
          },
        })

        // 2. InventoryBalance 감소
        const balance = await tx.inventoryBalance.findFirst({
          where: {
            tenantId,
            warehouseId: data.warehouseId,
            itemId: item.itemId,
          },
        })

        if (!balance) {
          throw new Error(
            `재고 없음: 해당 창고에 ${item.itemId} 재고가 없습니다.`
          )
        }

        const newQty = Number(balance.qtyOnHand) - item.issueQty
        if (newQty < 0) {
          throw new Error(
            `재고 부족: 현재 재고 ${Number(balance.qtyOnHand)}, 출고 요청 ${item.issueQty}`
          )
        }

        await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: {
            qtyOnHand: newQty,
            qtyAvailable: Math.max(0, newQty - Number(balance.qtyHold)),
          },
        })

        // 3. MaterialReservation upsert
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
          // 예약이 없으면 새로 생성
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
    revalidatePath("/app/mes/inventory-transactions")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "오류가 발생했습니다." }
  }
}
