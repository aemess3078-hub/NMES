"use server"

import { prisma } from "@/lib/db/prisma"
import { getTenantId, getCurrentUserId } from "@/lib/auth"
import { InspectionStage, InspectionResult } from "@prisma/client"
import { revalidatePath } from "next/cache"

export type InspectionStageRow = {
  id: string
  workOrderOperationId: string
  inspectionSpecId: string
  inspectorId: string
  stage: InspectionStage
  result: InspectionResult | null
  inspectedQty: any
  inspectedAt: Date
  workOrderOperation: {
    id: string
    workOrder: {
      id: string
      orderNo: string
      item: { id: string; code: string; name: string }
    }
    routingOperation: { id: string; name: string; seq: number }
    plannedQty: any
    completedQty: any
  }
  inspector: { id: string; name: string }
}

export async function getInspectionsByStage(stage?: InspectionStage): Promise<InspectionStageRow[]> {
  const tenantId = await getTenantId()
  return prisma.qualityInspection.findMany({
    where: {
      workOrderOperation: { workOrder: { tenantId } },
      ...(stage && { stage }),
    },
    include: {
      workOrderOperation: {
        include: {
          workOrder: {
            include: { item: { select: { id: true, code: true, name: true } } },
          },
          routingOperation: { select: { id: true, name: true, seq: true } },
        },
      },
      inspector: { select: { id: true, name: true } },
    },
    orderBy: { inspectedAt: "desc" },
  }) as any
}

export async function createStagedInspection(data: {
  workOrderOperationId: string
  inspectionSpecId: string
  stage: InspectionStage
  result: string
  inspectedQty: number
}) {
  const userId = await getCurrentUserId()

  await prisma.qualityInspection.create({
    data: {
      workOrderOperationId: data.workOrderOperationId,
      inspectionSpecId: data.inspectionSpecId,
      inspectorId: userId,
      stage: data.stage,
      result: data.result as InspectionResult,
      inspectedQty: data.inspectedQty,
    },
  })
  revalidatePath("/app/mes/inspection-stages")
  revalidatePath("/app/mes/inspection")
}

export async function getWorkOrdersForInspection() {
  const tenantId = await getTenantId()
  const ops = await prisma.workOrderOperation.findMany({
    where: {
      workOrder: { tenantId, status: { in: ["RELEASED", "IN_PROGRESS"] } },
    },
    include: {
      workOrder: {
        include: { item: { select: { id: true, code: true, name: true } } },
      },
      routingOperation: { select: { id: true, name: true, seq: true } },
    },
    orderBy: { workOrder: { orderNo: "asc" } },
  })

  // Attach inspection spec for each routingOperation
  const specMap = new Map<string, { id: string }>()
  const routingOpIds = Array.from(new Set(ops.map((o) => o.routingOperationId)))
  if (routingOpIds.length > 0) {
    const specs = await prisma.inspectionSpec.findMany({
      where: { tenantId, routingOperationId: { in: routingOpIds }, status: "ACTIVE" },
      select: { id: true, routingOperationId: true },
    })
    specs.forEach((s) => specMap.set(s.routingOperationId, { id: s.id }))
  }

  return ops.map((op) => ({
    ...op,
    inspectionSpecs: specMap.has(op.routingOperationId) ? [specMap.get(op.routingOperationId)!] : [],
  }))
}

export async function getInspectionStageSummary() {
  const tenantId = await getTenantId()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [first, mid, final, passCount, failCount] = await Promise.all([
    prisma.qualityInspection.count({
      where: { workOrderOperation: { workOrder: { tenantId } }, stage: "FIRST", inspectedAt: { gte: today } },
    }),
    prisma.qualityInspection.count({
      where: { workOrderOperation: { workOrder: { tenantId } }, stage: "MID", inspectedAt: { gte: today } },
    }),
    prisma.qualityInspection.count({
      where: { workOrderOperation: { workOrder: { tenantId } }, stage: "FINAL", inspectedAt: { gte: today } },
    }),
    prisma.qualityInspection.count({
      where: { workOrderOperation: { workOrder: { tenantId } }, result: "PASS", inspectedAt: { gte: today } },
    }),
    prisma.qualityInspection.count({
      where: { workOrderOperation: { workOrder: { tenantId } }, result: "FAIL", inspectedAt: { gte: today } },
    }),
  ])

  return { first, mid, final, passCount, failCount }
}
