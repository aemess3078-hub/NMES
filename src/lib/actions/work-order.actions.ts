"use server"

import { prisma } from "@/lib/db/prisma"
import { requireRole } from "@/lib/auth"
import { generateCnsManufacturingNo } from "@/lib/lot-numbering/lot-number-generator"
import type { CnsItemRuleContext } from "@/lib/lot-numbering/lot-rule-resolver"
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
    assignments: {
      id: string
      equipmentId: string
      assignedQty: number
      completedQty: number
      status: OperationStatus
      seq: number
      equipment: { id: string; code: string; name: string; workCenterId: string }
    }[]
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
      assignments: {
        include: {
          equipment: {
            select: { id: true, code: true, name: true, workCenterId: true },
          },
        },
        orderBy: { seq: "asc" },
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
      assignments: operation.assignments.map((assignment) => ({
        ...assignment,
        assignedQty: Number(assignment.assignedQty),
        completedQty: Number(assignment.completedQty),
      })),
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
  assignments?: {
    equipmentId: string
    assignedQty: number
  }[]
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
    select: { id: true, code: true, name: true, equipmentType: true, workCenterId: true },
    orderBy: { code: "asc" },
  })
}

type ValidatedWorkOrderOperationInput = Omit<WorkOrderOperationInput, "assignments"> & {
  assignments: {
    equipmentId: string
    assignedQty: number
    seq: number
    scaledAssignedQty: bigint
  }[]
}

const QTY_DECIMAL_SCALE = 6
const ZERO_QTY = BigInt(0)
const QTY_SCALE_MULTIPLIER = BigInt("1000000")

function toScaledQty(value: number | string | Prisma.Decimal, fieldName = "수량"): bigint {
  const raw = value?.toString().trim()
  if (!raw || !/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`${fieldName}은 0보다 큰 숫자여야 합니다.`)
  }

  const [integerPart, decimalPart = ""] = raw.split(".")
  if (decimalPart.length > QTY_DECIMAL_SCALE) {
    throw new Error(`${fieldName}은 소수점 ${QTY_DECIMAL_SCALE}자리까지만 입력할 수 있습니다.`)
  }

  const scaled =
    BigInt(integerPart) * QTY_SCALE_MULTIPLIER +
    BigInt(decimalPart.padEnd(QTY_DECIMAL_SCALE, "0"))

  if (scaled <= ZERO_QTY) {
    throw new Error(`${fieldName}은 0보다 커야 합니다.`)
  }

  return scaled
}

function sumScaledQty(values: bigint[]): bigint {
  return values.reduce((sum, value) => sum + value, ZERO_QTY)
}

function compareScaledQty(left: bigint, right: bigint): 0 | 1 | -1 {
  if (left === right) return 0
  return left > right ? 1 : -1
}

function formatScaledQty(value: bigint): string {
  const sign = value < ZERO_QTY ? "-" : ""
  const absolute = value < ZERO_QTY ? -value : value
  const integerPart = absolute / QTY_SCALE_MULTIPLIER
  const decimalPart = (absolute % QTY_SCALE_MULTIPLIER)
    .toString()
    .padStart(QTY_DECIMAL_SCALE, "0")
    .replace(/0+$/, "")

  return `${sign}${integerPart.toString()}${decimalPart ? `.${decimalPart}` : ""}`
}

async function validateWorkOrderOperationAssignments(
  operations: WorkOrderOperationInput[],
  tenantId: string
): Promise<ValidatedWorkOrderOperationInput[]> {
  const routingOperationIds = Array.from(
    new Set(operations.map((op) => op.routingOperationId).filter(Boolean))
  )
  const equipmentIds = Array.from(
    new Set(
      operations.flatMap((op) => [
        ...(op.equipmentId ? [op.equipmentId] : []),
        ...((op.assignments ?? []).map((assignment) => assignment.equipmentId).filter(Boolean)),
      ])
    )
  )

  const [routingOperations, equipments] = await Promise.all([
    prisma.routingOperation.findMany({
      where: { id: { in: routingOperationIds } },
      select: { id: true, workCenterId: true },
    }),
    equipmentIds.length > 0
      ? prisma.equipment.findMany({
          where: { id: { in: equipmentIds } },
          select: { id: true, tenantId: true, workCenterId: true },
        })
      : Promise.resolve([]),
  ])

  const routingOperationById = new Map(
    routingOperations.map((operation) => [operation.id, operation])
  )
  const equipmentById = new Map(equipments.map((equipment) => [equipment.id, equipment]))

  return operations.map((operation) => {
    const routingOperation = routingOperationById.get(operation.routingOperationId)
    if (!routingOperation) {
      throw new Error("공정 정보를 찾을 수 없습니다.")
    }

    const plannedQty = toScaledQty(operation.plannedQty, `공정 ${operation.seq} 계획수량`)

    const assignments = (operation.assignments ?? [])
      .filter((assignment) => assignment.equipmentId)
      .map((assignment, assignmentIndex) => ({
        equipmentId: assignment.equipmentId,
        assignedQty: Number(assignment.assignedQty),
        scaledAssignedQty: toScaledQty(
          assignment.assignedQty,
          `공정 ${operation.seq} 설비 배정수량`
        ),
        seq: assignmentIndex + 1,
      }))

    if (assignments.length === 0) {
      if (operation.equipmentId) {
        const equipment = equipmentById.get(operation.equipmentId)
        if (!equipment || equipment.tenantId !== tenantId) {
          throw new Error("선택한 설비를 찾을 수 없습니다.")
        }
        if (equipment.workCenterId !== routingOperation.workCenterId) {
          throw new Error("공정의 작업장과 설비의 작업장이 일치하지 않습니다.")
        }
      }
      return { ...operation, assignments: [] }
    }

    const selectedEquipmentIds = new Set<string>()

    for (const assignment of assignments) {
      if (selectedEquipmentIds.has(assignment.equipmentId)) {
        throw new Error("같은 공정 안에서 동일한 설비를 중복 배정할 수 없습니다.")
      }
      selectedEquipmentIds.add(assignment.equipmentId)

      const equipment = equipmentById.get(assignment.equipmentId)
      if (!equipment || equipment.tenantId !== tenantId) {
        throw new Error("선택한 설비를 찾을 수 없습니다.")
      }
      if (equipment.workCenterId !== routingOperation.workCenterId) {
        throw new Error("공정의 작업장과 설비의 작업장이 일치하지 않습니다.")
      }
    }

    const assignedTotal = sumScaledQty(assignments.map((assignment) => assignment.scaledAssignedQty))
    const comparison = compareScaledQty(assignedTotal, plannedQty)
    if (comparison !== 0) {
      const difference =
        comparison > 0 ? assignedTotal - plannedQty : plannedQty - assignedTotal
      const direction = comparison > 0 ? "초과" : "부족"
      throw new Error(
        `공정 ${operation.seq} 설비 배정수량 합계가 계획수량과 일치하지 않습니다. (${formatScaledQty(difference)} ${direction})`
      )
    }

    return {
      ...operation,
      equipmentId: assignments[0]?.equipmentId ?? operation.equipmentId ?? null,
      assignments,
    }
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

// 제조번호 자동 생성: CNS prefix + YY + month letter(A-L) + 3-digit sequence.
async function getCnsItemRuleContext(
  tenantId: string,
  itemId?: string | null,
): Promise<CnsItemRuleContext> {
  if (!itemId) return {}

  const item = await prisma.item.findFirst({
    where: { id: itemId, tenantId },
    select: {
      code: true,
      itemType: true,
      itemGroup: { select: { code: true } },
      category: { select: { code: true } },
    },
  })

  return {
    itemCode: item?.code,
    itemGroupCode: item?.itemGroup?.code,
    itemCategoryCode: item?.category?.code,
    itemType: item?.itemType,
  }
}

export async function generateManufacturingNo(
  tenantId: string,
  itemId?: string | null,
  sequenceOffset = 0,
): Promise<string> {
  const itemContext = await getCnsItemRuleContext(tenantId, itemId)
  return generateCnsManufacturingNo(prisma, tenantId, itemContext, new Date(), sequenceOffset)
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createWorkOrder(data: CreateWorkOrderInput, tenantId: string) {
  await requireRole("OPERATOR")
  const { operations, dueDate, manufacturingNo, ...headerFields } = data
  const validatedOperations = await validateWorkOrderOperationAssignments(operations, tenantId)

  // 제조번호: 수동 입력 우선, 미입력 시 자동 생성 (MFG-YYYYMMDD-NNN)
  const trimmed = manufacturingNo?.trim()
  const finalManufacturingNo = trimmed && trimmed.length > 0
    ? trimmed
    : await generateManufacturingNo(tenantId, headerFields.itemId)

  await prisma.workOrder.create({
    data: {
      ...headerFields,
      tenantId,
      manufacturingNo: finalManufacturingNo,
      dueDate: dueDate ? new Date(dueDate) : null,
      operations: {
        create: validatedOperations.map((op) => ({
          routingOperationId: op.routingOperationId,
          equipmentId: op.equipmentId ?? null,
          seq: op.seq,
          plannedQty: op.plannedQty,
          assignments:
            op.assignments.length > 0
              ? {
                  create: op.assignments.map((assignment) => ({
                    tenantId,
                    equipmentId: assignment.equipmentId,
                    assignedQty: assignment.assignedQty,
                    seq: assignment.seq,
                  })),
                }
              : undefined,
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
    select: { status: true, tenantId: true },
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
  const validatedOperations = await validateWorkOrderOperationAssignments(
    operations,
    existing.tenantId
  )
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
          create: validatedOperations.map((op) => ({
            routingOperationId: op.routingOperationId,
            equipmentId: op.equipmentId ?? null,
            seq: op.seq,
            plannedQty: op.plannedQty,
            assignments:
              op.assignments.length > 0
                ? {
                    create: op.assignments.map((assignment) => ({
                      tenantId: existing.tenantId,
                      equipmentId: assignment.equipmentId,
                      assignedQty: assignment.assignedQty,
                      seq: assignment.seq,
                    })),
                  }
                : undefined,
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
      select: {
        status: true,
        _count: {
          select: { operations: true },
        },
      },
    })
    if (!existing) return { success: false, error: "작업지시를 찾을 수 없습니다." }
    if (existing.status !== "DRAFT") {
      return { success: false, error: "초안(DRAFT) 상태의 작업지시만 릴리즈할 수 있습니다." }
    }
    if (existing._count.operations === 0) {
      return { success: false, error: "공정이 없는 작업지시는 작업대기로 전환할 수 없습니다." }
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
