"use server"

import { prisma } from "@/lib/db/prisma"
import { requireRole } from "@/lib/auth"
import { WorkOrderStatus, OperationStatus, Prisma } from "@prisma/client"
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
  manufacturingNo: string | null
  plannedQty: number
  status: WorkOrderStatus
  dueDate: string | null
  productionPlanItemId: string | null
  createdAt: string
  updatedAt: string
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
    plannedQty: number
    completedQty: number
    routingOperation: { id: string; name: string; seq: number }
    equipment: { id: string; code: string; name: string } | null
    productionResults: {
      id: string
      startedAt: string | null
      endedAt: string | null
    }[]
  }[]
  materialLots: {
    id: string
    manufacturingNo: string | null
    materialLotNo: string
    qty: number
    unit: string | null
    issuedAt: string
    materialItem: { id: string; code: string; name: string; spec: string | null; uom: string }
  }[]
}

const workOrderInclude = {
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
      productionResults: {
        select: { id: true, startedAt: true, endedAt: true },
        orderBy: { startedAt: "asc" },
      },
    },
    orderBy: { seq: "asc" },
  },
  materialLots: {
    include: {
      materialItem: {
        select: { id: true, code: true, name: true, spec: true, uom: true },
      },
    },
    orderBy: { issuedAt: "asc" },
  },
} satisfies Prisma.WorkOrderInclude

type WorkOrderPayload = Prisma.WorkOrderGetPayload<{ include: typeof workOrderInclude }>

function serializeWorkOrder(workOrder: WorkOrderPayload): WorkOrderWithDetails {
  return {
    ...workOrder,
    plannedQty: Number(workOrder.plannedQty),
    dueDate: workOrder.dueDate?.toISOString() ?? null,
    createdAt: workOrder.createdAt.toISOString(),
    updatedAt: workOrder.updatedAt.toISOString(),
    operations: workOrder.operations.map((operation) => ({
      ...operation,
      plannedQty: Number(operation.plannedQty),
      completedQty: Number(operation.completedQty),
      productionResults: operation.productionResults.map((result) => ({
        ...result,
        startedAt: result.startedAt?.toISOString() ?? null,
        endedAt: result.endedAt?.toISOString() ?? null,
      })),
    })),
    materialLots: workOrder.materialLots.map((lot) => ({
      ...lot,
      qty: Number(lot.qty),
      issuedAt: lot.issuedAt.toISOString(),
    })),
  }
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
  manufacturingNo?: string | null
  plannedQty: number
  status: WorkOrderStatus
  dueDate?: string | null
  productionPlanItemId?: string | null
  operations: WorkOrderOperationInput[]
}

// ─── Query Functions ──────────────────────────────────────────────────────────

export async function getWorkOrders(): Promise<WorkOrderWithDetails[]> {
  const workOrders = await prisma.workOrder.findMany({
    include: workOrderInclude,
    orderBy: [{ createdAt: "desc" }],
  })

  return workOrders.map(serializeWorkOrder)
}

export type WipInventoryRow = Awaited<ReturnType<typeof getWipInventoryRows>>[number]

export async function getWipInventoryRows(tenantId: string) {
  const operations = await prisma.workOrderOperation.findMany({
    where: {
      workOrder: {
        tenantId,
        status: { in: ["RELEASED", "IN_PROGRESS", "COMPLETED"] },
      },
    },
    select: {
      id: true,
      seq: true,
      status: true,
      plannedQty: true,
      completedQty: true,
      equipment: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      workOrder: {
        select: {
          id: true,
          orderNo: true,
          status: true,
          plannedQty: true,
          dueDate: true,
          createdAt: true,
          item: {
            select: {
              id: true,
              code: true,
              name: true,
              uom: true,
            },
          },
        },
      },
      routingOperation: {
        select: {
          id: true,
          seq: true,
          operationCode: true,
          name: true,
          workCenter: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      },
      wipUnits: {
        select: {
          id: true,
          qty: true,
          status: true,
          currentLocation: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      },
      productionResults: {
        select: {
          id: true,
          goodQty: true,
          defectQty: true,
          reworkQty: true,
          startedAt: true,
          endedAt: true,
        },
        orderBy: { startedAt: "asc" },
      },
    },
    orderBy: [
      { workOrder: { dueDate: "asc" } },
      { workOrder: { orderNo: "asc" } },
      { seq: "asc" },
    ],
  })

  return operations.map((operation) => {
    const productionQty = Number(operation.completedQty)
    const plannedQty = Number(operation.plannedQty)
    const activeWipQty = operation.wipUnits
      .filter((unit) => unit.status === "IN_PROCESS" || unit.status === "ON_HOLD")
      .reduce((sum, unit) => sum + Number(unit.qty), 0)
    const totalGoodQty = operation.productionResults.reduce(
      (sum, result) => sum + Number(result.goodQty),
      0
    )
    const totalDefectQty = operation.productionResults.reduce(
      (sum, result) => sum + Number(result.defectQty),
      0
    )
    const startedAt = operation.productionResults.find((result) => result.startedAt)?.startedAt ?? null

    return {
      id: operation.id,
      seq: operation.seq,
      status: operation.status,
      plannedQty,
      productionQty,
      remainingQty: plannedQty - productionQty,
      activeWipQty,
      totalGoodQty,
      totalDefectQty,
      startedAt,
      workOrder: {
        id: operation.workOrder.id,
        orderNo: operation.workOrder.orderNo,
        status: operation.workOrder.status,
        plannedQty: Number(operation.workOrder.plannedQty),
        dueDate: operation.workOrder.dueDate,
        createdAt: operation.workOrder.createdAt,
        item: operation.workOrder.item,
      },
      routingOperation: operation.routingOperation,
      equipment: operation.equipment,
      wipLocations: operation.wipUnits
        .map((unit) => unit.currentLocation)
        .filter((location): location is NonNullable<typeof location> => location != null),
    }
  })
}

export async function getWorkOrderById(id: string): Promise<WorkOrderWithDetails | null> {
  const workOrder = await prisma.workOrder.findUnique({
    where: { id },
    include: workOrderInclude,
  })

  return workOrder ? serializeWorkOrder(workOrder) : null
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

// 제조번호 자동 생성: MFG-YYYYMMDD-NNN (수동 입력이 없을 때만 사용)
export async function generateManufacturingNo(tenantId: string): Promise<string> {
  const now = new Date()
  const ymd =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0")
  const prefix = `MFG-${ymd}-`

  const latest = await prisma.workOrder.findFirst({
    where: {
      tenantId,
      manufacturingNo: { startsWith: prefix },
    },
    orderBy: { manufacturingNo: "desc" },
    select: { manufacturingNo: true },
  })

  let nextSeq = 1
  if (latest?.manufacturingNo) {
    const parts = latest.manufacturingNo.split("-")
    const lastSeq = parseInt(parts[parts.length - 1], 10)
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1
    }
  }

  return `${prefix}${String(nextSeq).padStart(3, "0")}`
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createWorkOrder(data: CreateWorkOrderInput, tenantId: string) {
  await requireRole("OPERATOR")
  const { operations, dueDate, manufacturingNo, ...headerFields } = data

  // 제조번호: 수동 입력 우선, 미입력 시 자동 생성 (MFG-YYYYMMDD-NNN)
  const trimmed = manufacturingNo?.trim()
  const finalManufacturingNo = trimmed && trimmed.length > 0
    ? trimmed
    : await generateManufacturingNo(tenantId)

  await prisma.workOrder.create({
    data: {
      ...headerFields,
      tenantId,
      manufacturingNo: finalManufacturingNo,
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
  await requireRole("OPERATOR")
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

  const { operations, dueDate, manufacturingNo, ...headerFields } = data
  const trimmed = manufacturingNo?.trim()

  await prisma.$transaction([
    prisma.workOrderOperation.deleteMany({ where: { workOrderId: id } }),
    prisma.workOrder.update({
      where: { id },
      data: {
        ...headerFields,
        manufacturingNo: trimmed && trimmed.length > 0 ? trimmed : null,
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
  await requireRole("OPERATOR")
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
