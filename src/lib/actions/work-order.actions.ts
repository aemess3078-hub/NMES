"use server"

import { requireTenantContext } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { WorkOrderStatus, OperationStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"

export type WorkOrderWithDetails = {
  id: string
  tenantId: string
  siteId: string
  itemId: string
  bomId: string
  routingId: string
  orderNo: string
  plannedQty: any
  status: WorkOrderStatus
  dueDate: Date | null
  productionPlanItemId: string | null
  createdAt: Date
  updatedAt: Date
  item: { id: string; code: string; name: string; itemType: string }
  bom: { id: string; version: string; item: { name: string } }
  routing: { id: string; code: string; name: string; version: string }
  site: { id: string; code: string; name: string }
  productionPlanItem: any | null
  operations: {
    id: string
    workOrderId: string
    routingOperationId: string
    equipmentId: string | null
    seq: number
    status: OperationStatus
    plannedQty: any
    completedQty: any
    routingOperation: { id: string; name: string; seq: number }
    equipment: { id: string; code: string; name: string } | null
  }[]
}

export type WorkOrderOperationInput = {
  routingOperationId: string
  equipmentId?: string | null
  seq: number
  plannedQty: number
}

export type CreateWorkOrderInput = {
  siteId: string
  itemId: string
  bomId: string
  routingId: string
  orderNo: string
  plannedQty: number
  status: WorkOrderStatus
  dueDate?: string | null
  productionPlanItemId?: string | null
  operations: WorkOrderOperationInput[]
}

export async function getWorkOrders(): Promise<WorkOrderWithDetails[]> {
  const { tenantId } = await requireTenantContext()
  return prisma.workOrder.findMany({
    where: { tenantId },
    include: {
      item: {
        select: { id: true, code: true, name: true, itemType: true },
      },
      bom: {
        select: {
          id: true,
          version: true,
          item: { select: { name: true } },
        },
      },
      routing: {
        select: {
          id: true,
          code: true,
          name: true,
          version: true,
        },
      },
      site: {
        select: { id: true, code: true, name: true },
      },
      productionPlanItem: true,
      operations: {
        include: {
          routingOperation: {
            select: { id: true, name: true, seq: true },
          },
          equipment: {
            select: { id: true, code: true, name: true },
          },
        },
        orderBy: { seq: "asc" },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  }) as any
}

export async function getWorkOrderById(id: string): Promise<WorkOrderWithDetails | null> {
  const { tenantId } = await requireTenantContext()
  return prisma.workOrder.findFirst({
    where: { id, tenantId },
    include: {
      item: {
        select: { id: true, code: true, name: true, itemType: true },
      },
      bom: {
        select: {
          id: true,
          version: true,
          item: { select: { name: true } },
        },
      },
      routing: {
        select: {
          id: true,
          code: true,
          name: true,
          version: true,
        },
      },
      site: {
        select: { id: true, code: true, name: true },
      },
      productionPlanItem: true,
      operations: {
        include: {
          routingOperation: {
            select: { id: true, name: true, seq: true },
          },
          equipment: {
            select: { id: true, code: true, name: true },
          },
        },
        orderBy: { seq: "asc" },
      },
    },
  }) as any
}

export async function getSites() {
  const { tenantId } = await requireTenantContext()
  return prisma.site.findMany({
    where: { tenantId },
    select: { id: true, code: true, name: true, type: true },
    orderBy: { name: "asc" },
  })
}

export async function getItemsForWorkOrder() {
  const { tenantId } = await requireTenantContext()
  return prisma.item.findMany({
    where: { tenantId, itemType: { in: ["FINISHED", "SEMI_FINISHED"] } },
    select: { id: true, code: true, name: true, itemType: true },
    orderBy: { code: "asc" },
  })
}

export async function getBomsForItem(itemId: string) {
  const { tenantId } = await requireTenantContext()
  return prisma.bOM.findMany({
    where: { tenantId, itemId, status: "ACTIVE" },
    select: { id: true, version: true, isDefault: true },
    orderBy: { version: "asc" },
  })
}

export async function getRoutingsForItem(itemId: string) {
  const { tenantId } = await requireTenantContext()
  const itemRoutings = await prisma.itemRouting.findMany({
    where: {
      tenantId,
      itemId,
      routing: { status: "ACTIVE", tenantId },
    },
    include: {
      routing: {
        include: {
          operations: {
            orderBy: { seq: "asc" },
            include: {
              workCenter: {
                select: { id: true, code: true, name: true },
              },
            },
          },
        },
      },
    },
    orderBy: { routing: { version: "asc" } },
  })

  return itemRoutings.map((ir) => ({
    id: ir.routing.id,
    version: ir.routing.version,
    isDefault: ir.isDefault,
    operations: ir.routing.operations,
  }))
}

export async function getEquipments() {
  const { tenantId } = await requireTenantContext()
  return prisma.equipment.findMany({
    where: { tenantId },
    select: { id: true, code: true, name: true, equipmentType: true },
    orderBy: { code: "asc" },
  })
}

export async function generateOrderNo(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `WO-${year}-`

  const latest = await prisma.workOrder.findFirst({
    where: {
      tenantId,
      orderNo: { startsWith: prefix },
    },
    orderBy: { orderNo: "desc" },
    select: { orderNo: true },
  })

  let nextSeq = 1
  if (latest) {
    const parts = latest.orderNo.split("-")
    const lastSeq = parseInt(parts[parts.length - 1], 10)
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1
    }
  }

  return `${prefix}${String(nextSeq).padStart(3, "0")}`
}

export async function createWorkOrder(data: CreateWorkOrderInput, _tenantId?: string) {
  const { tenantId } = await requireTenantContext()
  const { operations, dueDate, ...headerFields } = data

  await prisma.workOrder.create({
    data: {
      ...headerFields,
      tenantId,
      dueDate: dueDate ? new Date(dueDate) : null,
      operations: {
        create: operations.map((op) => ({
          routingOperationId: op.routingOperationId,
          equipmentId: op.equipmentId ?? null,
          seq: op.seq,
          plannedQty: op.plannedQty,
        })),
      },
    },
  })

  revalidatePath("/app/mes/work-orders")
}

export async function updateWorkOrder(id: string, data: CreateWorkOrderInput) {
  const { tenantId } = await requireTenantContext()
  const existing = await prisma.workOrder.findFirst({
    where: { id, tenantId },
    select: { id: true, status: true },
  })

  if (!existing) {
    throw new Error("Work order not found in tenant scope")
  }

  const blockedStatuses: WorkOrderStatus[] = ["IN_PROGRESS", "COMPLETED", "CANCELLED"]
  if (blockedStatuses.includes(existing.status)) {
    throw new Error("This work order status cannot be edited")
  }

  const { operations, dueDate, ...headerFields } = data

  await prisma.$transaction([
    prisma.workOrderOperation.deleteMany({ where: { workOrderId: id, workOrder: { tenantId } } }),
    prisma.workOrder.update({
      where: { id: existing.id },
      data: {
        ...headerFields,
        dueDate: dueDate ? new Date(dueDate) : null,
        operations: {
          create: operations.map((op) => ({
            routingOperationId: op.routingOperationId,
            equipmentId: op.equipmentId ?? null,
            seq: op.seq,
            plannedQty: op.plannedQty,
          })),
        },
      },
    }),
  ])

  revalidatePath("/app/mes/work-orders")
}

export async function deleteWorkOrder(id: string) {
  const { tenantId } = await requireTenantContext()
  const existing = await prisma.workOrder.findFirst({
    where: { id, tenantId },
    select: { id: true, status: true },
  })

  if (!existing) {
    throw new Error("Work order not found in tenant scope")
  }

  const allowedStatuses: WorkOrderStatus[] = ["DRAFT", "RELEASED"]
  if (!allowedStatuses.includes(existing.status)) {
    throw new Error("Only draft or released work orders can be deleted")
  }

  await prisma.$transaction([
    prisma.workOrderOperation.deleteMany({ where: { workOrderId: id, workOrder: { tenantId } } }),
    prisma.workOrder.delete({ where: { id: existing.id } }),
  ])

  revalidatePath("/app/mes/work-orders")
}
