"use server"

import { prisma } from "@/lib/db/prisma"
import { OperationStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"

// ─── Types ────────────────────────────────────────────────────────────────────

export type OperationProgressRow = {
  id: string
  seq: number
  status: OperationStatus
  plannedQty: number
  completedQty: number
  workOrder: {
    id: string
    orderNo: string
    status: string
    dueDate: Date | null
    item: { id: string; code: string; name: string }
  }
  routingOperation: {
    id: string
    name: string
    seq: number
    workCenter: { id: string; name: string } | null
  }
  equipment: { id: string; code: string; name: string } | null
  productionResults: {
    id: string
    goodQty: number
    defectQty: number
    reworkQty: number
    startedAt: Date | null
    endedAt: Date | null
  }[]
  totalGoodQty: number
  totalDefectQty: number
  totalReworkQty: number
}

export type ReworkRow = {
  id: string // productionResult.id
  workOrderOperationId: string
  reworkQty: number
  defectQty: number
  startedAt: Date | null
  workOrder: {
    id: string
    orderNo: string
    item: { id: string; code: string; name: string }
  }
  routingOperation: {
    name: string
    seq: number
    workCenter: { name: string } | null
  }
}

// ─── 공정진행 조회 ──────────────────────────────────────────────────────────────

export async function getOperationProgressList(
  tenantId: string
): Promise<OperationProgressRow[]> {
  const operations = await prisma.workOrderOperation.findMany({
    where: {
      workOrder: {
        tenantId,
        status: { in: ["RELEASED", "IN_PROGRESS", "COMPLETED"] },
      },
    },
    include: {
      workOrder: {
        include: {
          item: { select: { id: true, code: true, name: true } },
        },
      },
      routingOperation: {
        include: {
          workCenter: { select: { id: true, name: true } },
        },
      },
      equipment: { select: { id: true, code: true, name: true } },
      productionResults: {
        orderBy: { startedAt: "asc" },
      },
    },
    orderBy: [
      { workOrder: { dueDate: "asc" } },
      { workOrder: { orderNo: "asc" } },
      { seq: "asc" },
    ],
  })

  return operations.map((op) => {
    const totalGoodQty = op.productionResults.reduce(
      (s, r) => s + Number(r.goodQty),
      0
    )
    const totalDefectQty = op.productionResults.reduce(
      (s, r) => s + Number(r.defectQty),
      0
    )
    const totalReworkQty = op.productionResults.reduce(
      (s, r) => s + Number(r.reworkQty),
      0
    )
    return {
      id: op.id,
      seq: op.seq,
      status: op.status,
      plannedQty: Number(op.plannedQty),
      completedQty: Number(op.completedQty),
      workOrder: {
        id: op.workOrder.id,
        orderNo: op.workOrder.orderNo,
        status: op.workOrder.status,
        dueDate: op.workOrder.dueDate,
        item: op.workOrder.item,
      },
      routingOperation: {
        id: op.routingOperation.id,
        name: op.routingOperation.name,
        seq: op.routingOperation.seq,
        workCenter: op.routingOperation.workCenter,
      },
      equipment: op.equipment,
      productionResults: op.productionResults.map((r) => ({
        id: r.id,
        goodQty: Number(r.goodQty),
        defectQty: Number(r.defectQty),
        reworkQty: Number(r.reworkQty),
        startedAt: r.startedAt,
        endedAt: r.endedAt,
      })),
      totalGoodQty,
      totalDefectQty,
      totalReworkQty,
    }
  })
}

// ─── 재작업 대기 목록 조회 ───────────────────────────────────────────────────────

export async function getReworkPendingList(
  tenantId: string
): Promise<ReworkRow[]> {
  const results = await prisma.productionResult.findMany({
    where: {
      reworkQty: { gt: 0 },
      workOrderOperation: {
        workOrder: { tenantId },
      },
    },
    include: {
      workOrderOperation: {
        include: {
          workOrder: {
            include: {
              item: { select: { id: true, code: true, name: true } },
            },
          },
          routingOperation: {
            include: {
              workCenter: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { startedAt: "desc" },
  })

  return results.map((r) => ({
    id: r.id,
    workOrderOperationId: r.workOrderOperationId,
    reworkQty: Number(r.reworkQty),
    defectQty: Number(r.defectQty),
    startedAt: r.startedAt,
    workOrder: {
      id: r.workOrderOperation.workOrder.id,
      orderNo: r.workOrderOperation.workOrder.orderNo,
      item: r.workOrderOperation.workOrder.item,
    },
    routingOperation: {
      name: r.workOrderOperation.routingOperation.name,
      seq: r.workOrderOperation.routingOperation.seq,
      workCenter: r.workOrderOperation.routingOperation.workCenter,
    },
  }))
}

// ─── 공정 상태 변경 ─────────────────────────────────────────────────────────────

export async function updateOperationStatusAction(
  operationId: string,
  status: OperationStatus
): Promise<{ ok: boolean; error?: string }> {
  try {
    const op = await prisma.workOrderOperation.findUnique({
      where: { id: operationId },
    })
    if (!op) return { ok: false, error: "공정을 찾을 수 없습니다." }

    await prisma.$transaction(async (tx) => {
      await tx.workOrderOperation.update({
        where: { id: operationId },
        data: { status },
      })

      if (status === "IN_PROGRESS") {
        await tx.workOrder.update({
          where: { id: op.workOrderId },
          data: { status: "IN_PROGRESS" },
        })
      } else if (status === "COMPLETED") {
        const allOps = await tx.workOrderOperation.findMany({
          where: { workOrderId: op.workOrderId },
        })
        const allDone = allOps.every(
          (o) =>
            o.id === operationId ||
            o.status === "COMPLETED" ||
            o.status === "SKIPPED"
        )
        if (allDone) {
          await tx.workOrder.update({
            where: { id: op.workOrderId },
            data: { status: "COMPLETED" },
          })
        }
      }
    })

    revalidatePath("/app/mes/process-progress")
    revalidatePath("/app/mes/work-orders")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "오류가 발생했습니다." }
  }
}

// ─── 공정부적합 처리 (재작업수량 설정) ────────────────────────────────────────────

export async function dispositionDefects(
  productionResultId: string,
  reworkQty: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.productionResult.update({
      where: { id: productionResultId },
      data: { reworkQty },
    })
    revalidatePath("/app/mes/process-progress")
    revalidatePath("/app/mes/rework")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "오류가 발생했습니다." }
  }
}

// ─── 재작업 완료 처리 ────────────────────────────────────────────────────────────

export async function completeRework(
  workOrderOperationId: string,
  reworkedGoodQty: number
): Promise<{ ok: boolean; error?: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.productionResult.create({
        data: {
          workOrderOperationId,
          goodQty: reworkedGoodQty,
          defectQty: 0,
          reworkQty: 0,
          startedAt: new Date(),
          endedAt: new Date(),
        },
      })
      await tx.workOrderOperation.update({
        where: { id: workOrderOperationId },
        data: { completedQty: { increment: reworkedGoodQty } },
      })
    })
    revalidatePath("/app/mes/process-progress")
    revalidatePath("/app/mes/rework")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "오류가 발생했습니다." }
  }
}
