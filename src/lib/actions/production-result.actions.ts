"use server"

import { prisma } from "@/lib/db/prisma"
import { cookies } from "next/headers"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProductionResultWithDetails = {
  id: string
  workOrderOperationId: string
  goodQty: number
  defectQty: number
  reworkQty: number
  startedAt: Date | null
  endedAt: Date | null
  workOrderOperation: {
    id: string
    seq: number
    status: string
    workOrder: {
      id: string
      orderNo: string
      item: {
        id: string
        code: string
        name: string
      }
    }
    routingOperation: {
      id: string
      name: string
      seq: number
      workCenter: {
        id: string
        name: string
      }
    }
  }
}

export type ProductionResultSummary = {
  totalGoodQty: number
  totalDefectQty: number
  totalReworkQty: number
  defectRate: number
  totalCount: number
}

export type ProductionResultFilters = {
  orderNo?: string
  startDate?: Date
  endDate?: Date
}

// ─── 1. 실적 전체 조회 ─────────────────────────────────────────────────────────

export async function getProductionResults(
  filters?: ProductionResultFilters
): Promise<ProductionResultWithDetails[]> {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"

  const results = await prisma.productionResult.findMany({
    where: {
      workOrderOperation: {
        workOrder: {
          tenantId,
          ...(filters?.orderNo
            ? {
                orderNo: {
                  contains: filters.orderNo,
                  mode: "insensitive",
                },
              }
            : {}),
        },
      },
      ...(filters?.startDate || filters?.endDate
        ? {
            startedAt: {
              ...(filters.startDate ? { gte: filters.startDate } : {}),
              ...(filters.endDate ? { lte: filters.endDate } : {}),
            },
          }
        : {}),
    },
    include: {
      workOrderOperation: {
        include: {
          workOrder: {
            include: {
              item: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                },
              },
            },
          },
          routingOperation: {
            include: {
              workCenter: {
                select: {
                  id: true,
                  name: true,
                },
              },
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
    goodQty: Number(r.goodQty),
    defectQty: Number(r.defectQty),
    reworkQty: Number(r.reworkQty),
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    workOrderOperation: {
      id: r.workOrderOperation.id,
      seq: r.workOrderOperation.seq,
      status: r.workOrderOperation.status,
      workOrder: {
        id: r.workOrderOperation.workOrder.id,
        orderNo: r.workOrderOperation.workOrder.orderNo,
        item: r.workOrderOperation.workOrder.item,
      },
      routingOperation: {
        id: r.workOrderOperation.routingOperation.id,
        name: r.workOrderOperation.routingOperation.name,
        seq: r.workOrderOperation.routingOperation.seq,
        workCenter: r.workOrderOperation.routingOperation.workCenter,
      },
    },
  }))
}

// ─── 2. 집계 요약 ──────────────────────────────────────────────────────────────

export async function getProductionResultSummary(
  results: ProductionResultWithDetails[]
): Promise<ProductionResultSummary> {
  const totalGoodQty = results.reduce((sum, r) => sum + r.goodQty, 0)
  const totalDefectQty = results.reduce((sum, r) => sum + r.defectQty, 0)
  const totalReworkQty = results.reduce((sum, r) => sum + r.reworkQty, 0)
  const totalProcessed = totalGoodQty + totalDefectQty + totalReworkQty
  const defectRate =
    totalProcessed > 0
      ? (totalDefectQty / totalProcessed) * 100
      : 0

  return {
    totalGoodQty,
    totalDefectQty,
    totalReworkQty,
    defectRate,
    totalCount: results.length,
  }
}
