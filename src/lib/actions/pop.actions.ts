"use server"

import { prisma } from "@/lib/db/prisma"
import { OperationStatus, Prisma, WorkOrderStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { getTenantId, requireRole } from "@/lib/auth"
import {
  assertValidPopPin,
  createPopPinFingerprint,
  verifyPopPin,
} from "@/lib/auth/pop-pin"
import {
  getPopWorkerSession,
  setPopWorkerSessionCookie,
  type PopWorkerSessionPayload,
} from "@/lib/auth/pop-worker-session"
import {
  advanceWipUnitOnOperationComplete,
  recordProductionResultQualityMovements,
  transitionWipUnitOnStart,
} from "@/lib/actions/wip-traceability.helpers"
import { syncProductionPlanStatusForWorkOrder } from "@/lib/actions/production-plan.actions"

// ─── Types ────────────────────────────────────────────────────────────────────

export type PopWorkerSession = {
  userId: string
  tenantUserId: string
  name: string
  role: string
  siteId: string
  tenantId: string
}

export type SubmitResultInput = {
  workOrderOperationId: string
  assignmentId?: string | null
  goodQty: number
  defectQty: number
  reworkQty: number
}

export type PopWorkQueueRow = {
  rowId: string
  operationId: string
  assignmentId: string | null
  workOrderId: string
  orderNo: string
  manufacturingNo: string | null
  itemCode: string
  itemName: string
  processName: string
  equipmentName: string | null
  seq: number
  status: OperationStatus
  operationStatus: OperationStatus
  assignmentStatus: OperationStatus | null
  plannedQty: number
  assignedQty: number | null
  completedQty: number
  remainingQty: number
  dueDate: string | null
  materialLotCount: number
  materialLotQty: number
  canWork: boolean
  availabilityLabel: string
  materialIssuanceReady: boolean
}

// ─── Auth context helpers ─────────────────────────────────────────────────────

type PopAuthContext =
  | { mode: "USER_SESSION"; tenantId: string }
  | { mode: "POP_WORKER_SESSION"; tenantId: string; siteId: string | null; session: PopWorkerSessionPayload }
  | { mode: "UNAUTHENTICATED" }

async function resolvePopAuthContext(): Promise<PopAuthContext> {
  const popWorkerSession = await getPopWorkerSession()
  try {
    await requireRole("OPERATOR")
    const tenantId = await getTenantId()
    return { mode: "USER_SESSION", tenantId }
  } catch {
    if (!popWorkerSession) return { mode: "UNAUTHENTICATED" }
    return {
      mode: "POP_WORKER_SESSION",
      tenantId: popWorkerSession.tenantId,
      siteId: popWorkerSession.siteId,
      session: popWorkerSession,
    }
  }
}

function assertPopSessionSiteMatch(
  session: PopWorkerSessionPayload,
  workOrderSiteId: string | null,
): void {
  if (session.siteId != null && workOrderSiteId != null && session.siteId !== workOrderSiteId) {
    throw new Error("해당 작업장의 작업만 처리할 수 있습니다.")
  }
}

// ─── 1. PIN 로그인 (데모용 간이 구현) ─────────────────────────────────────────

const QTY_DECIMAL_SCALE = 6
const ZERO_QTY = BigInt(0)
const QTY_SCALE_MULTIPLIER = BigInt("1000000")

function toScaledQty(
  value: number | string | Prisma.Decimal,
  fieldName = "수량",
  options: { allowZero?: boolean } = {}
): bigint {
  const raw = value?.toString().trim()
  if (!raw || !/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`${fieldName}은 0 이상의 숫자여야 합니다.`)
  }

  const [integerPart, decimalPart = ""] = raw.split(".")
  if (decimalPart.length > QTY_DECIMAL_SCALE) {
    throw new Error(`${fieldName}은 소수점 ${QTY_DECIMAL_SCALE}자리까지만 입력할 수 있습니다.`)
  }

  const scaled =
    BigInt(integerPart) * QTY_SCALE_MULTIPLIER +
    BigInt(decimalPart.padEnd(QTY_DECIMAL_SCALE, "0"))

  if (!options.allowZero && scaled <= ZERO_QTY) {
    throw new Error(`${fieldName}은 0보다 커야 합니다.`)
  }

  return scaled
}

function sumScaledQty(values: bigint[]): bigint {
  return values.reduce((sum, value) => sum + value, ZERO_QTY)
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

export async function popLogin(
  pin: string,
  tenantId: string
): Promise<PopWorkerSession | null> {
  try {
    assertValidPopPin(pin)
  } catch {
    return null
  }

  try {
    const popPinFingerprint = createPopPinFingerprint(tenantId, pin)
    const credential = await prisma.userCredential.findFirst({
      where: {
        tenantId,
        popPinFingerprint,
      },
      select: {
        isLocked: true,
        popPinHash: true,
        profileId: true,
        profile: {
          select: {
            name: true,
            tenantUsers: {
              where: { tenantId },
              select: {
                id: true,
                role: true,
                siteId: true,
                isActive: true,
              },
              take: 1,
            },
          },
        },
      },
    })

    if (credential) {
      if (!credential.popPinHash || credential.isLocked) return null
      const tenantUser = credential.profile.tenantUsers[0]
      if (!tenantUser?.isActive) return null
      if (await verifyPopPin(pin, credential.popPinHash)) {
        await setPopWorkerSessionCookie({
          tenantId,
          profileId: credential.profileId,
          tenantUserId: tenantUser.id,
          workerName: credential.profile.name,
          role: tenantUser.role,
          siteId: tenantUser.siteId,
        })
        return {
          userId: credential.profileId,
          tenantUserId: tenantUser.id,
          name: credential.profile.name,
          role: tenantUser.role,
          siteId: tenantUser.siteId ?? "site-a",
          tenantId,
        }
      }
      return null
    }
  } catch (e) {
    console.error("[popLogin] unexpected error during PIN auth:", e instanceof Error ? e.message : e)
    return null
  }

  return null
}

// ─── 2. 오늘의 작업지시 목록 ──────────────────────────────────────────────────

export async function getTodayWorkOrders() {
  return prisma.workOrder.findMany({
    where: {
      status: { in: ["RELEASED", "IN_PROGRESS"] },
    },
    include: {
      item: true,
      operations: {
        include: {
          routingOperation: true,
          equipment: true,
          assignments: {
            include: { equipment: true },
            orderBy: { seq: "asc" },
          },
        },
        orderBy: { seq: "asc" },
      },
    },
    orderBy: { dueDate: "asc" },
  })
}

// 자재출고 미완료 안내 문구 (UI/서버 가드 공통)
const MATERIAL_NOT_ISSUED_MESSAGE =
  "자재출고가 완료되지 않아 작업을 시작할 수 없습니다. 먼저 자재출고를 처리해 주세요."

// 작업지시 자재출고 완료 여부 판정
//  - 원본 WipUnit(parentWipUnitId=null, sourceProductionResultId=null)은
//    자재출고 시에만 생성되므로, 그 존재 자체가 "자재출고 완료" 신호다.
//  - 후속 공정(후처리/포장 등)은 같은 WipUnit이 계속 흐르므로 자동 충족된다.
async function workOrderHasMaterialIssuance(
  tenantId: string,
  workOrderId: string
): Promise<boolean> {
  const wipUnit = await prisma.wipUnit.findFirst({
    where: {
      tenantId,
      workOrderId,
      parentWipUnitId: null,
      sourceProductionResultId: null,
    },
    select: { id: true },
  })
  return Boolean(wipUnit)
}

export async function getPopWorkQueueRows(tenantId: string): Promise<PopWorkQueueRow[]> {
  const operations = await prisma.workOrderOperation.findMany({
    where: {
      status: { in: ["PENDING", "IN_PROGRESS"] },
      workOrder: {
        tenantId,
        status: { notIn: [WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED] },
      },
    },
    select: {
      id: true,
      seq: true,
      status: true,
      plannedQty: true,
      completedQty: true,
      equipment: {
        select: { name: true },
      },
      assignments: {
        select: {
          id: true,
          assignedQty: true,
          completedQty: true,
          status: true,
          equipment: { select: { name: true } },
        },
        orderBy: { seq: "asc" },
      },
      routingOperation: {
        select: { name: true },
      },
      workOrder: {
        select: {
          id: true,
          orderNo: true,
          manufacturingNo: true,
          dueDate: true,
          item: { select: { code: true, name: true } },
          operations: {
            select: { seq: true, status: true },
            orderBy: { seq: "asc" },
          },
          materialLots: { select: { id: true, qty: true } },
        },
      },
    },
    orderBy: [
      { workOrder: { dueDate: "asc" } },
      { workOrder: { orderNo: "asc" } },
      { seq: "asc" },
    ],
  })

  // 자재출고 완료(원본 WipUnit 존재) 작업지시 집합을 1회 조회
  const workOrderIds = Array.from(new Set(operations.map((o) => o.workOrder.id)))
  const issuedWorkOrderIds = new Set(
    (
      await prisma.wipUnit.findMany({
        where: {
          tenantId,
          workOrderId: { in: workOrderIds },
          parentWipUnitId: null,
          sourceProductionResultId: null,
        },
        select: { workOrderId: true },
        distinct: ["workOrderId"],
      })
    ).map((w) => w.workOrderId)
  )

  return operations.flatMap((operation): PopWorkQueueRow[] => {
    const previousOperations = operation.workOrder.operations.filter(
      (candidate) => candidate.seq < operation.seq
    )
    const previousCompleted = previousOperations.every(
      (candidate) => candidate.status === "COMPLETED"
    )
    const materialIssuanceReady = issuedWorkOrderIds.has(operation.workOrder.id)
    const operationCanWork =
      (operation.status === "IN_PROGRESS" || previousCompleted) && materialIssuanceReady
    const materialLotQty = operation.workOrder.materialLots.reduce(
      (sum, lot) => sum + Number(lot.qty),
      0
    )
    const plannedQty = Number(operation.plannedQty)
    const completedQty = Number(operation.completedQty)
    const baseRow = {
      operationId: operation.id,
      workOrderId: operation.workOrder.id,
      orderNo: operation.workOrder.orderNo,
      manufacturingNo: operation.workOrder.manufacturingNo,
      itemCode: operation.workOrder.item.code,
      itemName: operation.workOrder.item.name,
      processName: operation.routingOperation.name,
      seq: operation.seq,
      operationStatus: operation.status,
      dueDate: operation.workOrder.dueDate?.toISOString() ?? null,
      materialLotCount: operation.workOrder.materialLots.length,
      materialLotQty,
    }

    if (operation.assignments.length > 0) {
      return operation.assignments
        .filter((assignment) => assignment.status !== "COMPLETED")
        .map((assignment) => {
          const assignedQty = Number(assignment.assignedQty)
          const assignmentCompletedQty = Number(assignment.completedQty)
          const canWork = operationCanWork && assignment.status !== "COMPLETED"

          return {
            ...baseRow,
            rowId: assignment.id,
            assignmentId: assignment.id,
            equipmentName: assignment.equipment.name,
            status: assignment.status,
            assignmentStatus: assignment.status,
            plannedQty: assignedQty,
            assignedQty,
            completedQty: assignmentCompletedQty,
            remainingQty: Math.max(assignedQty - assignmentCompletedQty, 0),
            canWork,
            materialIssuanceReady,
            availabilityLabel:
              assignment.status === "IN_PROGRESS"
                ? "진행중"
                : !materialIssuanceReady
                  ? "자재출고 대기"
                  : canWork
                    ? "작업가능"
                    : "이전 공정 대기",
          } satisfies PopWorkQueueRow
        })
    }

    return [{
      ...baseRow,
      rowId: operation.id,
      assignmentId: null,
      equipmentName: operation.equipment?.name ?? null,
      status: operation.status,
      assignmentStatus: null,
      plannedQty,
      assignedQty: null,
      completedQty,
      remainingQty: Math.max(plannedQty - completedQty, 0),
      canWork: operationCanWork,
      materialIssuanceReady,
      availabilityLabel:
        operation.status === "IN_PROGRESS"
          ? "진행중"
          : !materialIssuanceReady
            ? "자재출고 대기"
            : operationCanWork
              ? "작업가능"
              : "이전 공정 대기",
    } satisfies PopWorkQueueRow]
  })
}

export async function getOperationDetail(operationId: string, assignmentId?: string | null) {
  const operation = await prisma.workOrderOperation.findUnique({
    where: { id: operationId },
    include: {
      workOrder: { include: { item: true } },
      routingOperation: true,
      equipment: true,
      assignments: {
        include: { equipment: true },
        orderBy: { seq: "asc" },
      },
      productionResults: {
        where: assignmentId ? { workOrderOperationAssignmentId: assignmentId } : undefined,
        orderBy: { startedAt: "desc" },
      },
    },
  })

  if (!operation) return null

  const selectedAssignment = assignmentId
    ? operation.assignments.find((assignment) => assignment.id === assignmentId) ?? null
    : null

  if (assignmentId && !selectedAssignment) return null

  const materialIssuanceReady = operation.workOrder
    ? await workOrderHasMaterialIssuance(operation.workOrder.tenantId, operation.workOrder.id)
    : true

  return {
    id: operation.id,
    seq: operation.seq,
    status: operation.status,
    materialIssuanceReady,
    plannedQty: Number(operation.plannedQty),
    completedQty: Number(operation.completedQty),
    workOrder: operation.workOrder
      ? {
          id: operation.workOrder.id,
          orderNo: operation.workOrder.orderNo,
          item: operation.workOrder.item
            ? {
                name: operation.workOrder.item.name,
                code: operation.workOrder.item.code,
              }
            : null,
        }
      : null,
    routingOperation: operation.routingOperation
      ? { name: operation.routingOperation.name }
      : null,
    equipment: operation.equipment ? { name: operation.equipment.name } : null,
    assignments: operation.assignments.map((assignment) => ({
      id: assignment.id,
      status: assignment.status,
      assignedQty: Number(assignment.assignedQty),
      completedQty: Number(assignment.completedQty),
      equipment: { name: assignment.equipment.name },
    })),
    selectedAssignment: selectedAssignment
      ? {
          id: selectedAssignment.id,
          status: selectedAssignment.status,
          assignedQty: Number(selectedAssignment.assignedQty),
          completedQty: Number(selectedAssignment.completedQty),
          equipment: { name: selectedAssignment.equipment.name },
        }
      : null,
    productionResults: operation.productionResults.map((result) => ({
      id: result.id,
      goodQty: Number(result.goodQty),
      defectQty: Number(result.defectQty),
      reworkQty: Number(result.reworkQty),
      startedAt: result.startedAt?.toISOString() ?? null,
    })),
  }
}

export async function submitProductionResult(
  data: SubmitResultInput
): Promise<{ success: boolean; error?: string; isCompleted?: boolean }> {
  const { workOrderOperationId, assignmentId, goodQty, defectQty, reworkQty } = data

  if (goodQty < 0 || defectQty < 0 || reworkQty < 0) {
    return { success: false, error: "수량은 0 이상이어야 합니다." }
  }

  let totalScaled: bigint
  try {
    totalScaled = sumScaledQty([
      toScaledQty(goodQty, "양품수량", { allowZero: true }),
      toScaledQty(defectQty, "불량수량", { allowZero: true }),
      toScaledQty(reworkQty, "재작업수량", { allowZero: true }),
    ])
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "수량 형식이 올바르지 않습니다." }
  }

  if (totalScaled <= ZERO_QTY) {
    return { success: false, error: "수량을 1 이상 입력해 주세요." }
  }

  try {
    const authCtx = await resolvePopAuthContext()
    if (authCtx.mode === "UNAUTHENTICATED") {
      return { success: false, error: "작업자 로그인이 필요합니다." }
    }
    let isCompleted = false

    await prisma.$transaction(async (tx) => {
      // Serialize concurrent assignment completions on the same operation via row-level lock
      if (assignmentId) {
        await tx.$queryRaw`SELECT id FROM "WorkOrderOperation" WHERE id = ${workOrderOperationId} FOR UPDATE`
      }

      const op = await tx.workOrderOperation.findUnique({
        where: { id: workOrderOperationId },
        select: {
          id: true,
          status: true,
          completedQty: true,
          plannedQty: true,
          workOrderId: true,
          seq: true,
          assignments: {
            select: {
              id: true,
              tenantId: true,
              workOrderOperationId: true,
              assignedQty: true,
              completedQty: true,
              status: true,
            },
            orderBy: { seq: "asc" },
          },
          routingOperation: {
            select: { workCenterId: true },
          },
          workOrder: {
            select: {
              tenantId: true,
              siteId: true,
              operations: {
                select: { seq: true, status: true },
                orderBy: { seq: "asc" },
              },
            },
          },
        },
      })
      if (!op) throw new Error("공정을 찾을 수 없습니다.")
      if (authCtx.mode === "POP_WORKER_SESSION") {
        if (authCtx.tenantId !== op.workOrder.tenantId) {
          throw new Error("작업자 세션과 작업지시 사업장이 일치하지 않습니다.")
        }
        assertPopSessionSiteMatch(authCtx.session, op.workOrder.siteId)
      }

      const previousOperations = op.workOrder.operations.filter((candidate) => candidate.seq < op.seq)
      if (previousOperations.length > 0 && !previousOperations.every((candidate) => candidate.status === "COMPLETED")) {
        throw new Error("이전 공정이 완료되지 않아 실적을 등록할 수 없습니다.")
      }

      // 자재출고 완료(원본 WipUnit 존재) 전에는 실적등록 차단 (우회 입력 방지)
      const hasIssuance = await tx.wipUnit.findFirst({
        where: {
          workOrderId: op.workOrderId,
          parentWipUnitId: null,
          sourceProductionResultId: null,
        },
        select: { id: true },
      })
      if (!hasIssuance) {
        throw new Error(MATERIAL_NOT_ISSUED_MESSAGE)
      }

      if (op.status !== "IN_PROGRESS") {
        throw new Error("작업시작 후 실적을 등록해 주세요.")
      }

      const assignment = assignmentId
        ? op.assignments.find((candidate) => candidate.id === assignmentId) ?? null
        : null

      if (op.assignments.length > 0 && !assignmentId) {
        throw new Error("설비배정이 있는 공정은 설비를 선택해 실적을 등록해 주세요.")
      }

      if (assignmentId) {
        if (!assignment) throw new Error("설비배정을 찾을 수 없습니다.")
        if (assignment.workOrderOperationId !== workOrderOperationId) {
          throw new Error("설비배정과 공정이 일치하지 않습니다.")
        }
        if (assignment.tenantId !== op.workOrder.tenantId) {
          throw new Error("설비배정의 사업장 정보가 일치하지 않습니다.")
        }
        if (assignment.status === "COMPLETED") {
          throw new Error("이미 완료된 설비배정에는 실적을 추가할 수 없습니다.")
        }
        if (assignment.status !== "IN_PROGRESS") {
          throw new Error("설비배정 작업시작 후 실적을 등록해 주세요.")
        }

        const assignedScaled = toScaledQty(assignment.assignedQty, "배정수량")
        const assignmentCompletedScaled = toScaledQty(assignment.completedQty, "완료수량", { allowZero: true })
        const newAssignmentCompletedScaled = assignmentCompletedScaled + totalScaled

        if (newAssignmentCompletedScaled > assignedScaled) {
          const remainingScaled = assignedScaled - assignmentCompletedScaled
          throw new Error("잔여 수량(" + formatScaledQty(remainingScaled) + ")을 초과할 수 없습니다.")
        }

        const assignmentShouldComplete = newAssignmentCompletedScaled >= assignedScaled
        const assignmentCompletedById = new Map(
          op.assignments.map((candidate) => [
            candidate.id,
            candidate.id === assignment.id
              ? newAssignmentCompletedScaled
              : toScaledQty(candidate.completedQty, "완료수량", { allowZero: true }),
          ])
        )
        const operationCompletedScaled = sumScaledQty(Array.from(assignmentCompletedById.values()))

        const createdResult = await tx.productionResult.create({
          data: {
            workOrderOperationId,
            workOrderOperationAssignmentId: assignment.id,
            goodQty,
            defectQty,
            reworkQty,
            startedAt: new Date(),
            endedAt: new Date(),
          },
        })

        await recordProductionResultQualityMovements(tx, {
          tenantId: op.workOrder.tenantId,
          siteId: op.workOrder.siteId,
          workOrderId: op.workOrderId,
          operationId: workOrderOperationId,
          workCenterId: op.routingOperation.workCenterId,
          productionResultId: createdResult.id,
          defectQty,
          reworkQty,
        })

        await tx.workOrderOperationAssignment.update({
          where: { id: assignment.id },
          data: {
            completedQty: formatScaledQty(newAssignmentCompletedScaled),
            status: assignmentShouldComplete ? "COMPLETED" : "IN_PROGRESS",
          },
        })

        // Re-query after update: lock guarantees no concurrent modifications; fresh read
        // includes our just-applied update, replacing stale snapshot-based calculation
        const freshAssignments = await tx.workOrderOperationAssignment.findMany({
          where: { workOrderOperationId },
          select: { status: true },
        })
        const allAssignmentsCompleted = freshAssignments.every((a) => a.status === "COMPLETED")

        await tx.workOrderOperation.update({
          where: { id: workOrderOperationId },
          data: {
            completedQty: formatScaledQty(operationCompletedScaled),
            ...(allAssignmentsCompleted ? { status: "COMPLETED" as OperationStatus } : {}),
          },
        })

        if (allAssignmentsCompleted) {
          isCompleted = true
          const allOps = await tx.workOrderOperation.findMany({
            where: { workOrderId: op.workOrderId },
            select: {
              id: true,
              seq: true,
              status: true,
              routingOperation: { select: { workCenterId: true } },
            },
            orderBy: { seq: "asc" },
          })
          const allCompleted = allOps.every((candidate) => candidate.status === "COMPLETED")
          if (allCompleted) {
            await tx.workOrder.update({
              where: { id: op.workOrderId },
              data: { status: "COMPLETED" },
            })
            await syncProductionPlanStatusForWorkOrder(
              tx,
              op.workOrderId,
              op.workOrder.tenantId
            )
          }

          const nextOp = allOps.find((candidate) => candidate.seq > op.seq)
          await advanceWipUnitOnOperationComplete(tx, {
            tenantId: op.workOrder.tenantId,
            siteId: op.workOrder.siteId,
            workOrderId: op.workOrderId,
            completedOperationId: workOrderOperationId,
            completedWorkCenterId: op.routingOperation.workCenterId,
            nextOperation: nextOp
              ? {
                  id: nextOp.id,
                  routingOperation: {
                    workCenterId: nextOp.routingOperation.workCenterId,
                  },
                }
              : null,
            productionResultId: createdResult.id,
          })
        }

        return
      }

      const currentCompletedScaled = toScaledQty(op.completedQty, "완료수량", { allowZero: true })
      const plannedScaled = toScaledQty(op.plannedQty, "계획수량")
      const newCompletedScaled = currentCompletedScaled + totalScaled

      if (newCompletedScaled > plannedScaled) {
        const remainingScaled = plannedScaled - currentCompletedScaled
        throw new Error("잔여 수량(" + formatScaledQty(remainingScaled) + ")을 초과할 수 없습니다.")
      }

      const shouldComplete = newCompletedScaled >= plannedScaled

      const createdResult = await tx.productionResult.create({
        data: {
          workOrderOperationId,
          goodQty,
          defectQty,
          reworkQty,
          startedAt: new Date(),
          endedAt: new Date(),
        },
      })

      await recordProductionResultQualityMovements(tx, {
        tenantId: op.workOrder.tenantId,
        siteId: op.workOrder.siteId,
        workOrderId: op.workOrderId,
        operationId: workOrderOperationId,
        workCenterId: op.routingOperation.workCenterId,
        productionResultId: createdResult.id,
        defectQty,
        reworkQty,
      })

      await tx.workOrderOperation.update({
        where: { id: workOrderOperationId },
        data: {
          completedQty: formatScaledQty(newCompletedScaled),
          ...(shouldComplete ? { status: "COMPLETED" as OperationStatus } : {}),
        },
      })

      if (shouldComplete) {
        isCompleted = true
        const allOps = await tx.workOrderOperation.findMany({
          where: { workOrderId: op.workOrderId },
          select: {
            id: true,
            seq: true,
            status: true,
            routingOperation: { select: { workCenterId: true } },
          },
          orderBy: { seq: "asc" },
        })
        const allCompleted = allOps.every((candidate) => candidate.status === "COMPLETED")
        if (allCompleted) {
          await tx.workOrder.update({
            where: { id: op.workOrderId },
            data: { status: "COMPLETED" },
          })
          await syncProductionPlanStatusForWorkOrder(
            tx,
            op.workOrderId,
            op.workOrder.tenantId
          )
        }

        const nextOp = allOps.find((candidate) => candidate.seq > op.seq)
        await advanceWipUnitOnOperationComplete(tx, {
          tenantId: op.workOrder.tenantId,
          siteId: op.workOrder.siteId,
          workOrderId: op.workOrderId,
          completedOperationId: workOrderOperationId,
          completedWorkCenterId: op.routingOperation.workCenterId,
          nextOperation: nextOp
            ? {
                id: nextOp.id,
                routingOperation: {
                  workCenterId: nextOp.routingOperation.workCenterId,
                },
              }
            : null,
          productionResultId: createdResult.id,
        })
      }
    })

    revalidatePath("/app/pop/work-queue")
    revalidatePath("/pop/work-select")
    revalidatePath("/app/mes/production-plan")
    return { success: true, isCompleted }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "오류가 발생했습니다." }
  }
}

export async function startOperation(
  operationId: string,
  assignmentId?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const authCtx = await resolvePopAuthContext()
    if (authCtx.mode === "UNAUTHENTICATED") {
      return { success: false, error: "작업자 로그인이 필요합니다." }
    }
    const tenantId = authCtx.tenantId

    const op = await prisma.workOrderOperation.findFirst({
      where: {
        id: operationId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
        workOrder: { tenantId },
      },
      select: {
        status: true,
        seq: true,
        workOrderId: true,
        assignments: {
          select: {
            id: true,
            tenantId: true,
            workOrderOperationId: true,
            status: true,
          },
        },
        routingOperation: {
          select: { workCenterId: true },
        },
        workOrder: {
          select: {
            id: true,
            siteId: true,
            operations: {
              select: { seq: true, status: true },
              orderBy: { seq: "asc" },
            },
          },
        },
      },
    })

    if (!op) {
      return { success: false, error: "Operation not found or already completed." }
    }

    if (authCtx.mode === "POP_WORKER_SESSION" && authCtx.siteId != null) {
      if (op.workOrder.siteId != null && op.workOrder.siteId !== authCtx.siteId) {
        return { success: false, error: "해당 작업장의 작업만 처리할 수 있습니다." }
      }
    }

    const prevOps = op.workOrder.operations.filter((o) => o.seq < op.seq)
    if (prevOps.length > 0 && !prevOps.every((o) => o.status === "COMPLETED")) {
      return { success: false, error: "Previous operation must be completed first." }
    }

    // 자재출고 완료(원본 WipUnit 존재) 전에는 작업시작 차단
    if (!(await workOrderHasMaterialIssuance(tenantId, op.workOrderId))) {
      return { success: false, error: MATERIAL_NOT_ISSUED_MESSAGE }
    }

    const assignment = assignmentId
      ? op.assignments.find((candidate) => candidate.id === assignmentId) ?? null
      : null

    if (op.assignments.length > 0 && !assignmentId) {
      return { success: false, error: "Select an equipment assignment before starting work." }
    }

    if (assignmentId) {
      if (!assignment) {
        return { success: false, error: "Equipment assignment not found." }
      }
      if (assignment.workOrderOperationId !== operationId || assignment.tenantId !== tenantId) {
        return { success: false, error: "Equipment assignment does not match this operation." }
      }
      if (assignment.status === "COMPLETED") {
        return { success: false, error: "Equipment assignment is already completed." }
      }
    }

    await prisma.$transaction(async (tx) => {
      if (op.status === "PENDING") {
        await tx.workOrderOperation.update({
          where: { id: operationId },
          data: { status: "IN_PROGRESS" },
        })
        await tx.workOrder.update({
          where: { id: op.workOrderId },
          data: { status: "IN_PROGRESS" },
        })
        await syncProductionPlanStatusForWorkOrder(tx, op.workOrderId, tenantId)

        await transitionWipUnitOnStart(tx, {
          tenantId,
          siteId: op.workOrder.siteId,
          workOrderId: op.workOrderId,
          operationId,
          workCenterId: op.routingOperation.workCenterId,
        })
      }

      if (assignment && assignment.status === "PENDING") {
        await tx.workOrderOperationAssignment.update({
          where: { id: assignment.id },
          data: { status: "IN_PROGRESS" },
        })
      }
    })

    revalidatePath("/app/pop/work-queue")
    revalidatePath("/pop/work-select")
    revalidatePath("/app/mes/production-plan")
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "오류가 발생했습니다." }
  }
}

export async function getTodayProductionResults() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  return prisma.productionResult.findMany({
    where: {
      startedAt: { gte: today, lt: tomorrow },
    },
    include: {
      workOrderOperation: {
        include: {
          routingOperation: { select: { name: true } },
          workOrder: {
            include: {
              item: { select: { name: true, code: true } },
            },
          },
        },
      },
    },
    orderBy: { startedAt: "desc" },
  })
}

// ─── 6. 공정 상태 변경 + WorkOrder 상태 자동 갱신 ────────────────────────────

export async function updateOperationStatus(
  operationId: string,
  status: OperationStatus
) {
  try { await requireRole("OPERATOR") } catch { /* POP 데모: 인증 없이도 동작 허용 */ }
  await prisma.$transaction(async (tx) => {
    await tx.workOrderOperation.update({
      where: { id: operationId },
      data: { status },
    })

      const op = await tx.workOrderOperation.findUnique({
        where: { id: operationId },
        select: {
          workOrderId: true,
          workOrder: { select: { tenantId: true } },
          assignments: {
            select: { status: true },
          },
      },
    })
    if (!op) return

    if (
      status === "COMPLETED" &&
      op.assignments.length > 0 &&
      !op.assignments.every((assignment) => assignment.status === "COMPLETED")
    ) {
      throw new Error("All equipment assignments must be completed first.")
    }

      if (status === "IN_PROGRESS") {
        await tx.workOrder.update({
          where: { id: op.workOrderId },
          data: { status: "IN_PROGRESS" },
        })
        await syncProductionPlanStatusForWorkOrder(tx, op.workOrderId, op.workOrder.tenantId)
      } else if (status === "COMPLETED") {
      // 모든 공정이 완료된 경우 WorkOrder도 완료
      const allOps = await tx.workOrderOperation.findMany({
        where: { workOrderId: op.workOrderId },
        select: { status: true },
      })
      const allCompleted = allOps.every((o) => o.status === "COMPLETED")
        if (allCompleted) {
          await tx.workOrder.update({
            where: { id: op.workOrderId },
            data: { status: "COMPLETED" },
          })
          await syncProductionPlanStatusForWorkOrder(tx, op.workOrderId, op.workOrder.tenantId)
        }
    }
  })
  revalidatePath("/app/mes/production-plan")
}
