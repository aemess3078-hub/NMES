"use server"

import { prisma } from "@/lib/db/prisma"
import { OperationStatus, WorkOrderStatus } from "@prisma/client"

// ─── Types ────────────────────────────────────────────────────────────────────

export type PopWorkerSession = {
  userId: string
  name: string
  role: string
  siteId: string
  tenantId: string
}

export type SubmitResultInput = {
  workOrderOperationId: string
  goodQty: number
  defectQty: number
  reworkQty: number
}

export type PopWorkQueueRow = {
  operationId: string
  workOrderId: string
  orderNo: string
  manufacturingNo: string | null
  itemCode: string
  itemName: string
  processName: string
  seq: number
  status: OperationStatus
  plannedQty: number
  completedQty: number
  remainingQty: number
  dueDate: string | null
  materialLotCount: number
  materialLotQty: number
  canWork: boolean
  availabilityLabel: "작업가능" | "이전 공정 대기" | "진행중"
}

// ─── 1. PIN 로그인 (데모용 간이 구현) ─────────────────────────────────────────

export async function popLogin(
  pin: string,
  tenantId: string
): Promise<PopWorkerSession | null> {
  // 데모: PIN "0000" → 기본 작업자로 로그인
  if (pin === "0000") {
    return {
      userId: "demo-worker",
      name: "데모 작업자",
      role: "OPERATOR",
      siteId: "site-a",
      tenantId,
    }
  }

  // TenantUser + Profile 조회 후 PIN 매칭 (이름 뒤 4자리 또는 "1234")
  try {
    const tenantUsers = await prisma.tenantUser.findMany({
      where: { tenantId },
      include: { profile: true },
    })

    const matched = tenantUsers.find((u) => {
      const nameLast4 = u.profile?.name?.slice(-4) ?? ""
      return nameLast4 === pin || pin === "1234"
    })

    if (!matched) return null

    return {
      userId: matched.profileId,
      name: matched.profile?.name ?? "작업자",
      role: matched.role,
      siteId: matched.siteId ?? "site-a",
      tenantId,
    }
  } catch {
    return null
  }
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
        },
        orderBy: { seq: "asc" },
      },
    },
    orderBy: { dueDate: "asc" },
  })
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
      routingOperation: {
        select: {
          name: true,
        },
      },
      workOrder: {
        select: {
          id: true,
          orderNo: true,
          manufacturingNo: true,
          dueDate: true,
          item: {
            select: {
              code: true,
              name: true,
            },
          },
          operations: {
            select: {
              seq: true,
              status: true,
            },
            orderBy: { seq: "asc" },
          },
          materialLots: {
            select: {
              id: true,
              qty: true,
            },
          },
        },
      },
    },
    orderBy: [
      { workOrder: { dueDate: "asc" } },
      { workOrder: { orderNo: "asc" } },
      { seq: "asc" },
    ],
  })

  return operations.map((operation) => {
    const previousOperations = operation.workOrder.operations.filter(
      (candidate) => candidate.seq < operation.seq
    )
    const previousCompleted = previousOperations.every(
      (candidate) => candidate.status === "COMPLETED"
    )
    const canWork = operation.status === "IN_PROGRESS" || previousCompleted
    const materialLotQty = operation.workOrder.materialLots.reduce(
      (sum, lot) => sum + Number(lot.qty),
      0
    )
    const plannedQty = Number(operation.plannedQty)
    const completedQty = Number(operation.completedQty)

    return {
      operationId: operation.id,
      workOrderId: operation.workOrder.id,
      orderNo: operation.workOrder.orderNo,
      manufacturingNo: operation.workOrder.manufacturingNo,
      itemCode: operation.workOrder.item.code,
      itemName: operation.workOrder.item.name,
      processName: operation.routingOperation.name,
      seq: operation.seq,
      status: operation.status,
      plannedQty,
      completedQty,
      remainingQty: Math.max(plannedQty - completedQty, 0),
      dueDate: operation.workOrder.dueDate?.toISOString() ?? null,
      materialLotCount: operation.workOrder.materialLots.length,
      materialLotQty,
      canWork,
      availabilityLabel:
        operation.status === "IN_PROGRESS"
          ? "진행중"
          : canWork
            ? "작업가능"
            : "이전 공정 대기",
    }
  })
}

// ─── 3. 공정 상세 조회 ────────────────────────────────────────────────────────

export async function getOperationDetail(operationId: string) {
  return prisma.workOrderOperation.findUnique({
    where: { id: operationId },
    include: {
      workOrder: { include: { item: true } },
      routingOperation: true,
      equipment: true,
      productionResults: { orderBy: { startedAt: "desc" } },
    },
  })
}

// ─── 4. 실적 등록 ─────────────────────────────────────────────────────────────

export async function submitProductionResult(data: SubmitResultInput) {
  const { workOrderOperationId, goodQty, defectQty, reworkQty } = data

  await prisma.$transaction(async (tx) => {
    // 실적 생성
    await tx.productionResult.create({
      data: {
        workOrderOperationId,
        goodQty,
        defectQty,
        reworkQty,
        startedAt: new Date(),
        endedAt: new Date(),
      },
    })

    // completedQty 누적 갱신
    const op = await tx.workOrderOperation.findUnique({
      where: { id: workOrderOperationId },
    })
    await tx.workOrderOperation.update({
      where: { id: workOrderOperationId },
      data: { completedQty: Number(op?.completedQty ?? 0) + goodQty },
    })
  })
}

// ─── 5. 공정 상태 변경 + WorkOrder 상태 자동 갱신 ────────────────────────────

export async function updateOperationStatus(
  operationId: string,
  status: OperationStatus
) {
  await prisma.$transaction(async (tx) => {
    await tx.workOrderOperation.update({
      where: { id: operationId },
      data: { status },
    })

    const op = await tx.workOrderOperation.findUnique({
      where: { id: operationId },
      select: { workOrderId: true },
    })
    if (!op) return

    if (status === "IN_PROGRESS") {
      await tx.workOrder.update({
        where: { id: op.workOrderId },
        data: { status: "IN_PROGRESS" },
      })
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
      }
    }
  })
}
