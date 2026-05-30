"use server"

import { prisma } from "@/lib/db/prisma"
import { requireRole } from "@/lib/auth"
import { WorkOrderStatus, OperationStatus, Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { computeWipReceiptStatus } from "./wip-receipt.helpers"

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
  const workOrders = await prisma.workOrder.findMany({
    where: {
      tenantId,
      status: { in: ["RELEASED", "IN_PROGRESS", "COMPLETED"] },
      wipUnits: { some: {} },
    },
    select: {
      id: true,
      orderNo: true,
      manufacturingNo: true,
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
      operations: {
        select: {
          id: true,
          seq: true,
          status: true,
          plannedQty: true,
          completedQty: true,
          productionResults: {
            select: { id: true, reworkQty: true },
          },
          routingOperation: {
            select: {
              id: true,
              seq: true,
              operationCode: true,
              name: true,
              workCenter: {
                select: { id: true, code: true, name: true },
              },
            },
          },
        },
        orderBy: { seq: "asc" },
      },
      finishedGoodsReceipts: {
        select: { receiptQty: true },
      },
      wipUnits: {
        select: {
          id: true,
          qty: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          parentWipUnitId: true,
          sourceProductionResultId: true,
          workOrderOperationId: true,
          parentWipUnit: {
            select: { id: true, qty: true, status: true },
          },
          sourceProductionResult: {
            select: { id: true, defectQty: true, reworkQty: true },
          },
          workOrderOperation: {
            select: {
              id: true,
              seq: true,
              status: true,
              plannedQty: true,
              completedQty: true,
              equipment: {
                select: { id: true, code: true, name: true },
              },
              routingOperation: {
                select: {
                  id: true,
                  seq: true,
                  operationCode: true,
                  name: true,
                  workCenter: {
                    select: { id: true, code: true, name: true },
                  },
                },
              },
            },
          },
          currentWorkCenter: {
            select: { id: true, code: true, name: true },
          },
          currentWarehouse: {
            select: { id: true, code: true, name: true },
          },
          currentLocation: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          movements: {
            select: {
              movementType: true,
              relatedWipUnitId: true,
              qty: true,
              note: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
          relatedMovements: {
            where: { movementType: "REWORK" },
            select: { id: true },
          },
        },
        orderBy: [{ parentWipUnitId: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [
      { dueDate: "asc" },
      { orderNo: "asc" },
    ],
  })

  return workOrders.flatMap((workOrder) => {
    const finalOperation = workOrder.operations.at(-1) ?? null
    // 입고 가능 수량 / 보류 사유는 wip-receipt 공용 헬퍼로 계산해
    // 완제품입고 검증 로직과 항상 동일한 기준을 사용한다.
    const wipReceipt = computeWipReceiptStatus(workOrder)
    const completedFinalRootQty = wipReceipt.completedRootQty
    const totalReceiptQty = wipReceipt.totalReceiptQty
    const availableReceiptQty = wipReceipt.availableReceiptQty
    const receiptBlockedReason = wipReceipt.blockReasonDisplay
    const sortedWipUnits = [...workOrder.wipUnits].sort((left, right) => {
      const leftIsRoot =
        left.parentWipUnitId == null && left.sourceProductionResultId == null
      const rightIsRoot =
        right.parentWipUnitId == null && right.sourceProductionResultId == null
      if (leftIsRoot !== rightIsRoot) return leftIsRoot ? -1 : 1
      return left.createdAt.getTime() - right.createdAt.getTime()
    })

    return sortedWipUnits.map((unit) => {
      const isRoot =
        unit.parentWipUnitId == null && unit.sourceProductionResultId == null
      const isReworkChild =
        !isRoot &&
        (unit.relatedMovements.length > 0 ||
          Number(unit.sourceProductionResult?.reworkQty ?? 0) > 0)
      const unitType = isRoot
        ? "ROOT"
        : isReworkChild
          ? "REWORK_CHILD"
          : unit.status === "SCRAPPED"
            ? "SCRAP_CHILD"
            : "CHILD"
      const isFinalCompletedRoot =
        isRoot &&
        unit.status === "COMPLETED" &&
        unit.workOrderOperationId === finalOperation?.id
      const receiptStatus = !isRoot
        ? "NOT_APPLICABLE"
        : !isFinalCompletedRoot
          ? "NOT_READY"
          : receiptBlockedReason
            ? "ON_HOLD"
            : availableReceiptQty > 0
              ? "AVAILABLE"
              : "RECEIVED"

      return {
        id: unit.id,
        unitType,
        qty: Number(unit.qty),
        wipStatus: unit.status,
        parentWipUnit: unit.parentWipUnit
          ? {
              id: unit.parentWipUnit.id,
              qty: Number(unit.parentWipUnit.qty),
              status: unit.parentWipUnit.status,
            }
          : null,
        sourceProductionResult: unit.sourceProductionResult
          ? {
              id: unit.sourceProductionResult.id,
              defectQty: Number(unit.sourceProductionResult.defectQty),
              reworkQty: Number(unit.sourceProductionResult.reworkQty),
            }
          : null,
        currentWorkCenter: unit.currentWorkCenter,
        currentWarehouse: unit.currentWarehouse,
        currentLocation: unit.currentLocation,
        latestMovement: unit.movements[0]
          ? {
              ...unit.movements[0],
              qty: Number(unit.movements[0].qty),
            }
          : null,
        receiptStatus,
        receiptBlockedReason: isRoot ? receiptBlockedReason : null,
        completedFinalRootQty,
        totalReceiptQty,
        availableReceiptQty,
        workOrder: {
          id: workOrder.id,
          orderNo: workOrder.orderNo,
          manufacturingNo: workOrder.manufacturingNo,
          status: workOrder.status,
          plannedQty: Number(workOrder.plannedQty),
          dueDate: workOrder.dueDate,
          createdAt: workOrder.createdAt,
          item: workOrder.item,
        },
        operation: {
          id: unit.workOrderOperation.id,
          seq: unit.workOrderOperation.seq,
          status: unit.workOrderOperation.status,
          plannedQty: Number(unit.workOrderOperation.plannedQty),
          completedQty: Number(unit.workOrderOperation.completedQty),
          routingOperation: unit.workOrderOperation.routingOperation,
          equipment: unit.workOrderOperation.equipment,
        },
      }
    })
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

export async function releaseWorkOrder(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await requireRole("OPERATOR")
    const existing = await prisma.workOrder.findUnique({
      where: { id },
      select: { status: true },
    })
    if (!existing) return { success: false, error: "작업지시를 찾을 수 없습니다." }
    if (existing.status !== "DRAFT") {
      return { success: false, error: "초안(DRAFT) 상태의 작업지시만 릴리즈할 수 있습니다." }
    }
    await prisma.workOrder.update({
      where: { id },
      data: { status: "RELEASED" },
    })
    revalidatePath("/app/mes/work-orders")
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "오류가 발생했습니다." }
  }
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
