"use server"

import { prisma } from "@/lib/db/prisma"
import { getTenantId } from "@/lib/auth"
import { isMissingDbObjectError } from "@/lib/db/prisma-error"

export type EquipmentMonitorRow = {
  id: string
  code: string
  name: string
  equipmentType: string
  status: string
  workCenter: { name: string }
  latestEvent: { eventType: string; startedAt: Date; endedAt: Date | null } | null
  openRepairs: number
  lastCheckResult: string | null
  recentTags: {
    displayName: string
    unit: string | null
    latestValue: string | null
    timestamp: Date | null
  }[]
}

export async function getEquipmentMonitorData(): Promise<EquipmentMonitorRow[]> {
  const tenantId = await getTenantId()

  try {
    const equipments = await prisma.equipment.findMany({
      where: { tenantId },
      include: {
        workCenter: { select: { name: true } },
        events: {
          orderBy: { startedAt: "desc" },
          take: 1,
        },
        connections: {
          where: { isActive: true },
          include: {
            tags: {
              where: { isActive: true, isEnabled: true, isVisible: true },
              orderBy: [{ displayOrder: "asc" }, { tagCode: "asc" }],
              include: {
                snapshots: {
                  orderBy: { timestamp: "desc" },
                  take: 1,
                },
              },
            },
          },
        },
      },
      orderBy: { code: "asc" },
    })

    return equipments.map((eq) => {
      const tags = eq.connections
        .flatMap((connection) => connection.tags)
        .sort((a, b) => {
          const orderDiff = a.displayOrder - b.displayOrder
          return orderDiff !== 0 ? orderDiff : a.tagCode.localeCompare(b.tagCode)
        })
        .slice(0, 4)

      return {
        id: eq.id,
        code: eq.code,
        name: eq.name,
        equipmentType: eq.equipmentType,
        status: eq.status,
        workCenter: eq.workCenter,
        latestEvent: eq.events[0] ?? null,
        openRepairs: 0,
        lastCheckResult: null,
        recentTags: tags.map((tag) => ({
          displayName: tag.displayName,
          unit: tag.unit,
          latestValue: tag.snapshots[0]?.value ?? null,
          timestamp: tag.snapshots[0]?.timestamp ?? null,
        })),
      }
    })
  } catch (error) {
    if (isMissingDbObjectError(error)) return []
    throw error
  }
}

export async function getProductionKPIs() {
  const tenantId = await getTenantId()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  try {
    const [activeWorkOrders, todayResults, totalEquipment, runningEquipment] =
      await Promise.all([
        prisma.workOrder.count({
          where: { tenantId, status: { in: ["RELEASED", "IN_PROGRESS"] } },
        }),
        prisma.productionResult.aggregate({
          where: {
            workOrderOperation: { workOrder: { tenantId } },
            endedAt: { gte: today },
          },
          _sum: { goodQty: true, defectQty: true },
        }),
        prisma.equipment.count({ where: { tenantId } }),
        prisma.equipment.count({ where: { tenantId, status: "ACTIVE" } }),
      ])

    const goodQty = Number(todayResults._sum?.goodQty ?? 0)
    const defectQty = Number(todayResults._sum?.defectQty ?? 0)
    const totalQty = goodQty + defectQty

    return {
      activeWorkOrders,
      todayGoodQty: goodQty,
      todayDefectQty: defectQty,
      defectRate: totalQty > 0 ? ((defectQty / totalQty) * 100).toFixed(1) : "0.0",
      openRepairs: 0,
      failedChecks: 0,
      equipmentAvailability:
        totalEquipment > 0 ? ((runningEquipment / totalEquipment) * 100).toFixed(1) : "0.0",
    }
  } catch (error) {
    if (!isMissingDbObjectError(error)) throw error
    return {
      activeWorkOrders: 0,
      todayGoodQty: 0,
      todayDefectQty: 0,
      defectRate: "0.0",
      openRepairs: 0,
      failedChecks: 0,
      equipmentAvailability: "0.0",
    }
  }
}
