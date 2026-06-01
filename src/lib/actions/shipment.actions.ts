"use server"

import { prisma } from "@/lib/db/prisma"
import { requireRole } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import type { Prisma } from "@prisma/client"

export async function getShipments(tenantId: string) {
  const rows = await prisma.shipmentOrder.findMany({
    where: { tenantId },
    include: {
      salesOrder: { include: { customer: true } },
      items: {
        include: {
          salesOrderItem: { include: { item: true } },
          item: true,
          lot: { select: { id: true, lotNo: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })
  return rows.map((o) => ({
    ...o,
    salesOrder: {
      ...o.salesOrder,
      totalAmount: o.salesOrder.totalAmount !== null ? Number(o.salesOrder.totalAmount) : null,
    },
    items: o.items.map((item) => ({
      ...item,
      qty: Number(item.qty),
      salesOrderItem: {
        ...item.salesOrderItem,
        qty: Number(item.salesOrderItem.qty),
        unitPrice: item.salesOrderItem.unitPrice !== null ? Number(item.salesOrderItem.unitPrice) : null,
        producedQty: Number(item.salesOrderItem.producedQty),
        shippedQty: Number(item.salesOrderItem.shippedQty),
      },
    })),
  }))
}

export type DeliveryStatusRow = Awaited<ReturnType<typeof getDeliveryStatusRows>>[number]

export async function getDeliveryStatusRows(tenantId: string) {
  const rows = await prisma.shipmentOrder.findMany({
    where: { tenantId },
    select: {
      id: true,
      shipmentNo: true,
      status: true,
      plannedDate: true,
      shippedDate: true,
      deliveredDate: true,
      salesOrder: {
        select: {
          id: true,
          orderNo: true,
          deliveryDate: true,
          status: true,
          customer: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          items: {
            select: {
              id: true,
              qty: true,
              shippedQty: true,
              item: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  uom: true,
                },
              },
            },
            orderBy: { item: { code: "asc" } },
          },
        },
      },
      items: {
        select: {
          id: true,
          qty: true,
          lotId: true,
          lot: { select: { id: true, lotNo: true } },
          item: {
            select: {
              id: true,
              code: true,
              name: true,
              uom: true,
            },
          },
          salesOrderItem: {
            select: {
              id: true,
              qty: true,
              shippedQty: true,
            },
          },
        },
        orderBy: { item: { code: "asc" } },
      },
    },
    orderBy: [{ plannedDate: "desc" }, { shipmentNo: "desc" }],
  })
  return rows.map((o) => ({
    ...o,
    salesOrder: {
      ...o.salesOrder,
      items: o.salesOrder.items.map((i) => ({
        ...i,
        qty: Number(i.qty),
        shippedQty: Number(i.shippedQty),
      })),
    },
    items: o.items.map((item) => ({
      ...item,
      qty: Number(item.qty),
      salesOrderItem: {
        ...item.salesOrderItem,
        qty: Number(item.salesOrderItem.qty),
        shippedQty: Number(item.salesOrderItem.shippedQty),
      },
    })),
  }))
}

export async function getShippableSalesOrders(tenantId: string) {
  const rows = await prisma.salesOrder.findMany({
    where: {
      tenantId,
      status: { in: ["CONFIRMED", "IN_PRODUCTION", "PARTIAL_SHIPPED"] },
    },
    select: {
      id: true,
      orderNo: true,
      status: true,
      deliveryDate: true,
      customer: { select: { name: true } },
      items: {
        select: {
          id: true,
          itemId: true,
          qty: true,
          shippedQty: true,
          item: { select: { id: true, code: true, name: true } },
        },
      },
    },
    orderBy: { deliveryDate: "asc" },
  })
  return rows.map((o) => ({
    ...o,
    items: o.items.map((i) => ({
      ...i,
      qty: Number(i.qty),
      shippedQty: Number(i.shippedQty),
    })),
  }))
}

export async function getWarehouses(tenantId: string) {
  return prisma.warehouse.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
  })
}

export type AvailableFinishedGoodsLot = {
  lotId: string
  lotNo: string
  itemId: string
  warehouseId: string
  warehouseName: string
  locationId: string | null
  locationName: string | null
  qtyAvailable: number
}

export async function getAvailableFinishedGoodsLots(
  tenantId: string,
  siteId: string,
  warehouseId: string,
  itemIds: string[]
): Promise<Record<string, AvailableFinishedGoodsLot[]>> {
  const uniqueItemIds = Array.from(new Set(itemIds.filter(Boolean)))
  if (!warehouseId || uniqueItemIds.length === 0) return {}

  const balances = await prisma.inventoryBalance.findMany({
    where: {
      tenantId,
      siteId,
      warehouseId,
      itemId: { in: uniqueItemIds },
      lotId: { not: null },
      qtyAvailable: { gt: 0 },
      lot: { status: "ACTIVE" },
    },
    include: {
      warehouse: { select: { id: true, name: true } },
      lot: { select: { id: true, lotNo: true, itemId: true } },
    },
    orderBy: [{ item: { code: "asc" } }, { lot: { lotNo: "asc" } }],
  })

  const validBalances = balances.filter(
    (balance): balance is typeof balance & { lot: NonNullable<typeof balance.lot> } =>
      balance.lot != null && balance.lot.itemId === balance.itemId,
  )

  const lotIds = validBalances.map((balance) => balance.lot.id)
  const receipts = lotIds.length > 0
    ? await prisma.finishedGoodsReceipt.findMany({
        where: {
          tenantId,
          siteId,
          warehouseId,
          lotId: { in: lotIds },
        },
        select: {
          lotId: true,
          location: { select: { id: true, name: true } },
          receiptAt: true,
        },
        orderBy: { receiptAt: "desc" },
      })
    : []

  const receiptByLotId = new Map<string, { locationId: string | null; locationName: string | null }>()
  for (const receipt of receipts) {
    if (!receipt.lotId || receiptByLotId.has(receipt.lotId)) continue
    receiptByLotId.set(receipt.lotId, {
      locationId: receipt.location?.id ?? null,
      locationName: receipt.location?.name ?? null,
    })
  }

  const lotsByItem: Record<string, AvailableFinishedGoodsLot[]> = {}
  for (const balance of validBalances) {
    const receipt = receiptByLotId.get(balance.lot.id)
    const row: AvailableFinishedGoodsLot = {
      lotId: balance.lot.id,
      lotNo: balance.lot.lotNo,
      itemId: balance.itemId,
      warehouseId: balance.warehouseId,
      warehouseName: balance.warehouse.name,
      locationId: receipt?.locationId ?? null,
      locationName: receipt?.locationName ?? null,
      qtyAvailable: Number(balance.qtyAvailable),
    }
    if (!lotsByItem[row.itemId]) lotsByItem[row.itemId] = []
    lotsByItem[row.itemId].push(row)
  }

  return lotsByItem
}

export async function generateShipmentNo(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `SH-${year}-`
  const last = await prisma.shipmentOrder.findFirst({
    where: { tenantId, shipmentNo: { startsWith: prefix } },
    orderBy: { shipmentNo: "desc" },
    select: { shipmentNo: true },
  })
  const seq = last ? (parseInt(last.shipmentNo.split("-")[2] ?? "0", 10) || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(3, "0")}`
}

function generateShipmentIssueTxNo(): string {
  const now = new Date()
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "")
  const hhmmssSSS = now.toISOString().slice(11, 23).replace(/[:.]/g, "")
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0")
  return `ISS-${yyyymmdd}-${hhmmssSSS}-${random}`
}

async function resolveSalesOrderStatusAfterShipmentRollback(
  tx: Prisma.TransactionClient,
  salesOrderId: string
) {
  const salesOrder = await tx.salesOrder.findUniqueOrThrow({
    where: { id: salesOrderId },
    select: {
      status: true,
      items: { select: { qty: true, shippedQty: true } },
    },
  })

  if (salesOrder.status === "CLOSED" || salesOrder.status === "CANCELLED") {
    return salesOrder.status
  }

  const totalQty = salesOrder.items.reduce((sum, item) => sum + Number(item.qty), 0)
  const shippedQty = salesOrder.items.reduce((sum, item) => sum + Number(item.shippedQty), 0)

  if (totalQty > 0 && shippedQty >= totalQty) return "SHIPPED"
  if (shippedQty > 0) return "PARTIAL_SHIPPED"

  const productionWorkOrder = await tx.workOrder.findFirst({
    where: {
      productionPlanItem: {
        salesOrderItem: { salesOrderId },
      },
      OR: [
        { status: { in: ["IN_PROGRESS", "COMPLETED"] } },
        { operations: { some: { status: { in: ["IN_PROGRESS", "COMPLETED"] } } } },
        { finishedGoodsReceipts: { some: {} } },
      ],
    },
    select: { id: true },
  })

  return productionWorkOrder ? "IN_PRODUCTION" : "CONFIRMED"
}

export type CreateShipmentItemInput = {
  salesOrderItemId: string
  itemId: string
  qty: number
  lotId?: string
}

export type CreateShipmentInput = {
  salesOrderId: string
  plannedDate: Date
  warehouseId?: string
  note?: string
  items: CreateShipmentItemInput[]
}

export async function createShipment(
  tenantId: string,
  siteId: string,
  data: CreateShipmentInput
) {
  await requireRole("OPERATOR")
  if (!data.warehouseId) {
    throw new Error("출하 창고를 선택하세요.")
  }
  if (data.items.length === 0) {
    throw new Error("출하 품목을 1개 이상 추가하세요.")
  }
  const warehouseId = data.warehouseId

  const duplicateKeys = new Set<string>()
  for (const item of data.items) {
    const key = `${item.salesOrderItemId}:${item.lotId}`
    if (duplicateKeys.has(key)) {
      throw new Error("같은 수주 품목과 LOT는 한 출하에 중복 등록할 수 없습니다.")
    }
    duplicateKeys.add(key)
  }

  const shipmentNo = await generateShipmentNo(tenantId)

  await prisma.$transaction(async (tx) => {
    const shipment = await tx.shipmentOrder.create({
      data: {
        tenantId,
        siteId,
        salesOrderId: data.salesOrderId,
        shipmentNo,
        plannedDate: data.plannedDate,
        warehouseId,
        note: data.note,
      },
    })

    for (const item of data.items) {
      if (item.qty <= 0) {
        throw new Error("출하 수량은 0보다 커야 합니다.")
      }

      const salesOrderItem = await tx.salesOrderItem.findFirst({
        where: {
          id: item.salesOrderItemId,
          salesOrderId: data.salesOrderId,
        },
        include: { item: { select: { code: true, name: true, isLotTracked: true } } },
      })
      if (!salesOrderItem) {
        throw new Error("수주 품목을 찾을 수 없습니다.")
      }
      if (salesOrderItem.itemId !== item.itemId) {
        throw new Error("수주 품목과 출하 품목이 일치하지 않습니다.")
      }

      const orderedQty = Number(salesOrderItem.qty)
      const alreadyShippedQty = Number(salesOrderItem.shippedQty)
      const remainingQty = orderedQty - alreadyShippedQty
      if (item.qty > remainingQty) {
        throw new Error(
          `[${salesOrderItem.item.code}] 출하 수량(${item.qty})이 미출하 수량(${remainingQty})을 초과합니다.`,
        )
      }

      const isLotTracked = salesOrderItem.item.isLotTracked

      if (isLotTracked) {
        if (!item.lotId) {
          throw new Error(`[${salesOrderItem.item.code}] LOT 관리 품목은 LOT를 선택해야 합니다.`)
        }

        const lot = await tx.lot.findFirst({
          where: { id: item.lotId, tenantId, status: "ACTIVE" },
          select: { id: true, lotNo: true, itemId: true },
        })
        if (!lot) {
          throw new Error("출하할 완제품 LOT를 찾을 수 없습니다.")
        }
        if (lot.itemId !== item.itemId) {
          throw new Error(`LOT(${lot.lotNo}) 품목과 출하 품목이 일치하지 않습니다.`)
        }

        const balance = await tx.inventoryBalance.findFirst({
          where: { tenantId, siteId, warehouseId, itemId: item.itemId, lotId: lot.id },
        })
        if (!balance) {
          throw new Error(`LOT(${lot.lotNo})의 출하 가능 재고가 없습니다.`)
        }
        const qtyOnHand = Number(balance.qtyOnHand)
        const qtyAvailable = Number(balance.qtyAvailable)
        if (qtyAvailable < item.qty || qtyOnHand < item.qty) {
          throw new Error(
            `LOT(${lot.lotNo}) 출하 가능 수량(${qtyAvailable})보다 많은 수량(${item.qty})을 출하할 수 없습니다.`,
          )
        }

        const shipmentItem = await tx.shipmentItem.create({
          data: {
            shipmentOrderId: shipment.id,
            salesOrderItemId: item.salesOrderItemId,
            itemId: item.itemId,
            qty: item.qty,
            lotId: lot.id,
          },
        })

        const txNo = generateShipmentIssueTxNo()
        await tx.inventoryTransaction.create({
          data: {
            tenantId,
            itemId: item.itemId,
            lotId: lot.id,
            fromLocationId: warehouseId,
            txNo,
            txType: "ISSUE",
            qty: item.qty,
            refType: "SHIPMENT_ITEM",
            refId: shipmentItem.id,
            note: `출하 처리 (${shipmentNo})`,
            txAt: new Date(),
          },
        })

        const updatedBalance = await tx.inventoryBalance.updateMany({
          where: {
            id: balance.id,
            tenantId,
            siteId,
            warehouseId,
            itemId: item.itemId,
            lotId: lot.id,
            qtyOnHand: { gte: item.qty },
            qtyAvailable: { gte: item.qty },
          },
          data: {
            qtyOnHand: { decrement: item.qty },
            qtyAvailable: { decrement: item.qty },
          },
        })
        if (updatedBalance.count !== 1) {
          throw new Error(`LOT(${lot.lotNo})의 가용 재고가 부족합니다. 다시 조회 후 시도하세요.`)
        }
      } else {
        // 비LOT 품목: lotId 없이 처리
        const balance = await tx.inventoryBalance.findFirst({
          where: { tenantId, siteId, warehouseId, itemId: item.itemId, lotId: null },
        })
        if (!balance) {
          throw new Error(`[${salesOrderItem.item.code}] 선택한 창고에 출하 가능한 재고가 없습니다.`)
        }
        const qtyAvailable = Number(balance.qtyAvailable)
        if (qtyAvailable < item.qty) {
          throw new Error(
            `[${salesOrderItem.item.code}] 출하 가능 수량(${qtyAvailable})보다 많은 수량(${item.qty})을 출하할 수 없습니다.`,
          )
        }

        const shipmentItem = await tx.shipmentItem.create({
          data: {
            shipmentOrderId: shipment.id,
            salesOrderItemId: item.salesOrderItemId,
            itemId: item.itemId,
            qty: item.qty,
          },
        })

        const txNo = generateShipmentIssueTxNo()
        await tx.inventoryTransaction.create({
          data: {
            tenantId,
            itemId: item.itemId,
            lotId: null,
            fromLocationId: warehouseId,
            txNo,
            txType: "ISSUE",
            qty: item.qty,
            refType: "SHIPMENT_ITEM",
            refId: shipmentItem.id,
            note: `출하 처리 (${shipmentNo})`,
            txAt: new Date(),
          },
        })

        const updatedBalance = await tx.inventoryBalance.updateMany({
          where: {
            id: balance.id,
            tenantId,
            siteId,
            warehouseId,
            itemId: item.itemId,
            lotId: null,
            qtyAvailable: { gte: item.qty },
          },
          data: {
            qtyOnHand: { decrement: item.qty },
            qtyAvailable: { decrement: item.qty },
          },
        })
        if (updatedBalance.count !== 1) {
          throw new Error(`[${salesOrderItem.item.code}] 재고가 부족합니다. 다시 조회 후 시도하세요.`)
        }
      }

      await tx.salesOrderItem.update({
        where: { id: item.salesOrderItemId },
        data: { shippedQty: { increment: item.qty } },
      })
    }

    const updatedItems = await tx.salesOrderItem.findMany({
      where: { salesOrderId: data.salesOrderId },
    })
    const fullyShipped = updatedItems.every(
      (i) => Number(i.shippedQty) >= Number(i.qty)
    )
    await tx.salesOrder.update({
      where: { id: data.salesOrderId },
      data: { status: fullyShipped ? "SHIPPED" : "PARTIAL_SHIPPED" },
    })
  })

  revalidatePath("/app/mes/shipments")
  revalidatePath("/app/mes/sales-orders")
  revalidatePath("/app/mes/sales/delivery-status")
  revalidatePath("/app/mes/sales/order-status")
  revalidatePath("/app/mes/inventory")
  revalidatePath("/app/mes/inventory-transactions")
  revalidatePath("/app/mes/manufacturing-traceability")
}

export async function confirmShipment(id: string) {
  await requireRole("OPERATOR")
  await prisma.shipmentOrder.update({
    where: { id },
    data: { status: "SHIPPED", shippedDate: new Date() },
  })
  revalidatePath("/app/mes/shipments")
}

export async function deleteShipment(id: string) {
  await requireRole("OPERATOR")
  const shipment = await prisma.shipmentOrder.findUniqueOrThrow({
    where: { id },
    include: {
      items: {
        include: { item: { select: { isLotTracked: true } } },
      },
    },
  })
  if (shipment.status !== "PLANNED") {
    throw new Error("PLANNED 상태의 출하만 삭제할 수 있습니다.")
  }

  await prisma.$transaction(async (tx) => {
    const shipmentItemIds = shipment.items.map((item) => item.id)

    for (const item of shipment.items) {
      if (shipment.warehouseId) {
        const isLotTracked = item.item.isLotTracked

        if (isLotTracked) {
          // LOT 관리 품목: lotId 기준으로 재고 복구
          if (item.lotId) {
            const balance = await tx.inventoryBalance.findFirst({
              where: {
                tenantId: shipment.tenantId,
                siteId: shipment.siteId,
                warehouseId: shipment.warehouseId,
                itemId: item.itemId,
                lotId: item.lotId,
              },
            })
            if (balance) {
              const qty = Number(item.qty)
              await tx.inventoryBalance.update({
                where: { id: balance.id },
                data: {
                  qtyOnHand: Number(balance.qtyOnHand) + qty,
                  qtyAvailable: Number(balance.qtyAvailable) + qty,
                },
              })
            }
          }
        } else {
          // 비LOT 품목: lotId=null 기준으로 재고 복구
          const balance = await tx.inventoryBalance.findFirst({
            where: {
              tenantId: shipment.tenantId,
              siteId: shipment.siteId,
              warehouseId: shipment.warehouseId,
              itemId: item.itemId,
              lotId: null,
            },
          })
          if (balance) {
            const qty = Number(item.qty)
            await tx.inventoryBalance.update({
              where: { id: balance.id },
              data: {
                qtyOnHand: Number(balance.qtyOnHand) + qty,
                qtyAvailable: Number(balance.qtyAvailable) + qty,
              },
            })
          }
        }
      }

      await tx.salesOrderItem.update({
        where: { id: item.salesOrderItemId },
        data: { shippedQty: { decrement: Number(item.qty) } },
      })
    }

    if (shipmentItemIds.length > 0) {
      await tx.inventoryTransaction.deleteMany({
        where: {
          tenantId: shipment.tenantId,
          refType: "SHIPMENT_ITEM",
          refId: { in: shipmentItemIds },
        },
      })
    }
    await tx.shipmentItem.deleteMany({ where: { shipmentOrderId: id } })
    await tx.shipmentOrder.delete({ where: { id } })

    const nextSalesOrderStatus = await resolveSalesOrderStatusAfterShipmentRollback(
      tx,
      shipment.salesOrderId
    )
    await tx.salesOrder.update({
      where: { id: shipment.salesOrderId },
      data: { status: nextSalesOrderStatus },
    })
  })

  revalidatePath("/app/mes/shipments")
  revalidatePath("/app/mes/sales-orders")
  revalidatePath("/app/mes/sales/delivery-status")
  revalidatePath("/app/mes/sales/order-status")
  revalidatePath("/app/mes/inventory")
  revalidatePath("/app/mes/inventory-transactions")
  revalidatePath("/app/mes/manufacturing-traceability")
}
