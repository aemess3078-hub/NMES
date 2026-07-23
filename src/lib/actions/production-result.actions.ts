"use server"

import { prisma } from "@/lib/db/prisma"
import { getTenantId } from "@/lib/auth"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProductionResultWithDetails = {
  id: string
  workOrderOperationId: string
  goodQty: number
  defectQty: number
  reworkQty: number
  startedAt: string | null
  endedAt: string | null
  equipment: {
    id: string
    code: string
    name: string
  } | null
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


export type ProductionResultFilters = {
  orderNo?: string
  startDate?: Date
  endDate?: Date
}

// ─── 1. 실적 전체 조회 ─────────────────────────────────────────────────────────

export async function getProductionResults(
  filters?: ProductionResultFilters
): Promise<ProductionResultWithDetails[]> {
  const tenantId = await getTenantId()

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
      workOrderOperationAssignment: {
        select: {
          equipment: {
            select: { id: true, code: true, name: true },
          },
        },
      },
      workOrderOperation: {
        include: {
          equipment: {
            select: { id: true, code: true, name: true },
          },
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

  return results.map((r) => {
    const equipment =
      r.workOrderOperationAssignment?.equipment ??
      r.workOrderOperation.equipment ??
      null

    return {
      id: r.id,
      workOrderOperationId: r.workOrderOperationId,
      goodQty: Number(r.goodQty),
      defectQty: Number(r.defectQty),
      reworkQty: Number(r.reworkQty),
      startedAt: r.startedAt?.toISOString() ?? null,
      endedAt: r.endedAt?.toISOString() ?? null,
      equipment,
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
    }
  })
}

