"use server"

import { prisma } from "@/lib/db/prisma"
import { WorkOrderStatus, OperationStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkOrderWithDetails = {
  id: string
  tenantId: string
  siteId: string
  itemId: string
  bomId: string
  routingId: string
  orderNo: string
  plannedQty: any // Decimal
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

// ─── Query Functions ──────────────────────────────────────────────────────────

export async function getWorkOrders(): Promise<WorkOrderWithDetails[]> {
  return prisma.workOrder.findMany({
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
  return prisma.workOrder.findUnique({
    where: { id },
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
  return prisma.site.findMany({
    select: { id: true, code: true, name: true, type: true },
    orderBy: { name: "asc" },
  })
}

export async function getItemsForWorkOrder() {
  return prisma.item.findMany({
    where: { itemType: { in: ["FINISHED", "SEMI_FINISHED"] } },
    select: { id: true, code: true, name: true, itemType: true },
    orderBy: { code: "asc" },
  })
}

export async function getBomsForItem(itemId: string) {
  return prisma.bOM.findMany({
    where: { itemId, status: "ACTIVE" },
    select: { id: true, version: true, isDefault: true },
    orderBy: { version: "asc" },
  })
}

export async function getRoutingsForItem(itemId: string) {
  const itemRoutings = await prisma.itemRouting.findMany({
    where: {
      itemId,
      routing: { status: "ACTIVE" },
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
  return prisma.equipment.findMany({
    select: { id: true, code: true, name: true, equipmentType: true },
    orderBy: { code: "asc" },
  })
}

// ─── Business Logic ───────────────────────────────────────────────────────────

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

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createWorkOrder(data: CreateWorkOrderInput, tenantId: string) {
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
  const existing = await prisma.workOrder.findUnique({
    where: { id },
    select: { status: true },
  })

  if (!existing) {
    throw new Error("작업지시를 찾을 수 없습니다.")
  }

  const blockedStatuses: WorkOrderStatus[] = ["IN_PROGRESS", "COMPLETED", "CANCELLED"]
  if (blockedStatuses.includes(existing.status)) {
    throw new Error(
      `'${existing.status}' 상태의 작업지시는 수정할 수 없습니다.`
    )
  }

  const { operations, dueDate, ...headerFields } = data

  await prisma.$transaction([
    prisma.workOrderOperation.deleteMany({ where: { workOrderId: id } }),
    prisma.workOrder.update({
      where: { id },
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
  const existing = await prisma.workOrder.findUnique({
    where: { id },
    select: { status: true },
  })

  if (!existing) {
    throw new Error("작업지시를 찾을 수 없습니다.")
  }

  const allowedStatuses: WorkOrderStatus[] = ["DRAFT", "RELEASED"]
  if (!allowedStatuses.includes(existing.status)) {
    throw new Error(
      `'${existing.status}' 상태의 작업지시는 삭제할 수 없습니다. DRAFT 또는 RELEASED 상태만 삭제 가능합니다.`
    )
  }

  await prisma.$transaction([
    prisma.workOrderOperation.deleteMany({ where: { workOrderId: id } }),
    prisma.workOrder.delete({ where: { id } }),
  ])

  revalidatePath("/app/mes/work-orders")
}
