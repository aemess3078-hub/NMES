"use server"

import { prisma } from "@/lib/db/prisma"
import { getTenantId } from "@/lib/auth"

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

  const equipments = await prisma.equipment.findMany({
    where: { tenantId },
    include: {
      workCenter: { select: { name: true } },
      events: {
        orderBy: { startedAt: "desc" },
        take: 1,
      },
      repairRequests: {
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
        select: { id: true },
      },
      dailyChecks: {
        orderBy: { checkDate: "desc" },
        take: 1,
        select: { result: true },
      },
      connections: {
        where: { isActive: true },
        include: {
          tags: {
            where: { isActive: true },
            include: {
              snapshots: {
                orderBy: { timestamp: "desc" },
                take: 1,
              },
            },
            take: 4,
          },
        },
        take: 1,
      },
    },
    orderBy: { code: "asc" },
  })

  return equipments.map((eq) => ({
    id: eq.id,
    code: eq.code,
    name: eq.name,
    equipmentType: eq.equipmentType,
    status: eq.status,
    workCenter: eq.workCenter,
    latestEvent: eq.events[0] ?? null,
    openRepairs: eq.repairRequests.length,
    lastCheckResult: eq.dailyChecks[0]?.result ?? null,
    recentTags: (eq.connections[0]?.tags ?? []).map((tag) => ({
      displayName: tag.displayName,
      unit: tag.unit,
      latestValue: tag.snapshots[0]?.value ?? null,
      timestamp: tag.snapshots[0]?.timestamp ?? null,
    })),
  }))
}

export async function getProductionKPIs() {
  const tenantId = await getTenantId()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [
    activeWorkOrders,
    todayResults,
    openRepairs,
    failedChecks,
    totalEquipment,
    runningEquipment,
  ] = await Promise.all([
    prisma.workOrder.count({ where: { tenantId, status: { in: ["RELEASED", "IN_PROGRESS"] } } }),
    prisma.productionResult.aggregate({
      where: { workOrderOperation: { workOrder: { tenantId } }, endedAt: { gte: today } },
      _sum: { goodQty: true, defectQty: true },
    }),
    prisma.equipmentRepairRequest.count({ where: { tenantId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.equipmentDailyCheck.count({
      where: { tenantId, result: "FAIL", checkDate: { gte: today } },
    }),
    prisma.equipment.count({ where: { tenantId } }),
    prisma.equipment.count({ where: { tenantId, status: "ACTIVE" } }),
  ])

  const goodQty = Number(todayResults._sum?.goodQty ?? 0)
  const defectQty = Number(todayResults._sum?.defectQty ?? 0)
  const totalQty = goodQty + defectQty
  const defectRate = totalQty > 0 ? ((defectQty / totalQty) * 100).toFixed(1) : "0.0"

  return {
    activeWorkOrders,
    todayGoodQty: goodQty,
    todayDefectQty: defectQty,
    defectRate,
    openRepairs,
    failedChecks,
    equipmentAvailability: totalEquipment > 0
      ? ((runningEquipment / totalEquipment) * 100).toFixed(1)
      : "0.0",
  }
}
