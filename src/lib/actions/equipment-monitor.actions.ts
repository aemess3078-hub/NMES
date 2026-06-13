"use server"

import { prisma } from "@/lib/db/prisma"
import { getTenantId } from "@/lib/auth"
import { isMissingDbObjectError, isSchemaCompatibilityError } from "@/lib/db/prisma-error"

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
  ncwatchTodayPartCount: number | null
  recentTags: {
    tagCode: string
    displayName: string
    unit: string | null
    latestValue: string | null
    timestamp: Date | null
  }[]
}

function parseNcwatchTimeToMinutes(value: string | null | undefined): number {
  if (!value) return 0
  const [hours = 0, minutes = 0, seconds = 0] = value.split(":").map(Number)
  return hours * 60 + minutes + seconds / 60
}

function normalizePercent(value: unknown): number | null {
  if (value == null) return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.max(0, Math.min(100, numeric))
}

async function getNcwatchAvailabilityRates(
  tenantId: string,
  equipmentIds: string[],
  reportFrom: Date,
  reportTo: Date,
): Promise<Map<string, number> | null> {
  if (equipmentIds.length === 0) return new Map()

  try {
    const mappings = await prisma.ncwatchEquipmentMapping.findMany({
      where: {
        tenantId,
        isActive: true,
        equipmentId: { in: equipmentIds },
      },
      select: {
        equipmentId: true,
        machineName: true,
      },
    })

    const machineNames = Array.from(new Set(mappings.map((mapping) => mapping.machineName)))
    if (machineNames.length === 0) return new Map()

    const reports = await prisma.ncwatchReportDaily.findMany({
      where: {
        tenantId,
        machineName: { in: machineNames },
        reportDate: { gte: reportFrom, lte: reportTo },
      },
      select: {
        machineName: true,
        runTime: true,
        stopTime: true,
        manualTime: true,
        alarmTime: true,
        offlineTime: true,
        runPct: true,
        receivedAt: true,
      },
      orderBy: { receivedAt: "desc" },
    })

    const latestReportByMachine = new Map<string, (typeof reports)[number]>()
    for (const report of reports) {
      if (!latestReportByMachine.has(report.machineName)) {
        latestReportByMachine.set(report.machineName, report)
      }
    }

    const rates = new Map<string, number>()
    for (const mapping of mappings) {
      if (!mapping.equipmentId) continue
      const report = latestReportByMachine.get(mapping.machineName)
      if (!report) continue

      const runMinutes = parseNcwatchTimeToMinutes(report.runTime)
      const totalMinutes =
        runMinutes +
        parseNcwatchTimeToMinutes(report.stopTime) +
        parseNcwatchTimeToMinutes(report.manualTime) +
        parseNcwatchTimeToMinutes(report.alarmTime) +
        parseNcwatchTimeToMinutes(report.offlineTime)

      const rate =
        totalMinutes > 0 ? (runMinutes / totalMinutes) * 100 : normalizePercent(report.runPct)

      if (rate != null) {
        rates.set(mapping.equipmentId, rate)
      }
    }

    return rates
  } catch (error) {
    if (isMissingDbObjectError(error) || isSchemaCompatibilityError(error)) return null
    throw error
  }
}

async function getNcwatchTodayPartCounts(
  tenantId: string,
  equipmentIds: string[],
  reportFrom: Date,
  reportTo: Date,
): Promise<Map<string, number> | null> {
  if (equipmentIds.length === 0) return new Map()

  try {
    const mappings = await prisma.ncwatchEquipmentMapping.findMany({
      where: {
        tenantId,
        isActive: true,
        equipmentId: { in: equipmentIds },
      },
      select: {
        equipmentId: true,
        machineName: true,
      },
    })

    const machineNames = Array.from(new Set(mappings.map((mapping) => mapping.machineName)))
    if (machineNames.length === 0) return new Map()

    const reports = await prisma.ncwatchReportDaily.findMany({
      where: {
        tenantId,
        machineName: { in: machineNames },
        reportDate: { gte: reportFrom, lte: reportTo },
      },
      select: {
        machineName: true,
        partCount: true,
        receivedAt: true,
      },
      orderBy: { receivedAt: "desc" },
    })

    const latestPartCountByMachine = new Map<string, number>()
    for (const report of reports) {
      if (report.partCount == null || latestPartCountByMachine.has(report.machineName)) continue
      latestPartCountByMachine.set(report.machineName, report.partCount)
    }

    const counts = new Map<string, number>()
    for (const mapping of mappings) {
      if (!mapping.equipmentId) continue
      const partCount = latestPartCountByMachine.get(mapping.machineName)
      if (partCount != null) counts.set(mapping.equipmentId, partCount)
    }

    return counts
  } catch (error) {
    if (isMissingDbObjectError(error) || isSchemaCompatibilityError(error)) return null
    throw error
  }
}

export async function getEquipmentMonitorData(): Promise<EquipmentMonitorRow[]> {
  const tenantId = await getTenantId()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayEnd = new Date(today)
  todayEnd.setHours(23, 59, 59, 999)

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
    const todayPartCounts = await getNcwatchTodayPartCounts(
      tenantId,
      equipments.map((equipment) => equipment.id),
      today,
      todayEnd,
    )

    return equipments.map((eq) => {
      const tags = eq.connections
        .flatMap((connection) => connection.tags)
        .sort((a, b) => {
          const orderDiff = a.displayOrder - b.displayOrder
          return orderDiff !== 0 ? orderDiff : a.tagCode.localeCompare(b.tagCode)
        })

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
        ncwatchTodayPartCount: todayPartCounts?.get(eq.id) ?? null,
        recentTags: tags.map((tag) => ({
          tagCode: tag.tagCode,
          displayName: tag.displayName,
          unit: tag.unit,
          latestValue: tag.snapshots[0]?.value ?? null,
          timestamp: tag.snapshots[0]?.timestamp ?? null,
        })),
      }
    })
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      // connection 전체 객체(protocol 포함) 대신 select로 필요한 필드만 지정.
      // protocol 을 조회하지 않으면 NCWATCH_AGENT 값 역직렬화 실패를 피할 수 있다.
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
            select: {
              tags: {
                where: { isActive: true },
                orderBy: { tagCode: "asc" },
                select: {
                  tagCode:     true,
                  displayName: true,
                  unit:        true,
                  snapshots: {
                    orderBy: { timestamp: "desc" },
                    take: 1,
                    select: { value: true, timestamp: true },
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
          .sort((a, b) => a.tagCode.localeCompare(b.tagCode))

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
          ncwatchTodayPartCount: null,
          recentTags: tags.map((tag) => ({
            tagCode: tag.tagCode,
            displayName: tag.displayName,
            unit: tag.unit,
            latestValue: tag.snapshots[0]?.value ?? null,
            timestamp: tag.snapshots[0]?.timestamp ?? null,
          })),
        }
      })
    }
    if (isMissingDbObjectError(error)) return []
    throw error
  }
}

export async function getProductionKPIs() {
  const tenantId = await getTenantId()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayEnd = new Date(today)
  todayEnd.setHours(23, 59, 59, 999)

  try {
    const [activeWorkOrders, todayResults, equipments] =
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
        prisma.equipment.findMany({
          where: { tenantId },
          select: { id: true, status: true },
        }),
      ])

    const goodQty = Number(todayResults._sum?.goodQty ?? 0)
    const defectQty = Number(todayResults._sum?.defectQty ?? 0)
    const totalQty = goodQty + defectQty
    const ncwatchRates = await getNcwatchAvailabilityRates(
      tenantId,
      equipments.map((equipment) => equipment.id),
      today,
      todayEnd,
    )
    const availabilityTotal = equipments.reduce((sum, equipment) => {
      const ncwatchRate = ncwatchRates?.get(equipment.id)
      if (ncwatchRate != null) return sum + ncwatchRate
      return sum + (equipment.status === "ACTIVE" ? 100 : 0)
    }, 0)

    return {
      activeWorkOrders,
      todayGoodQty: goodQty,
      todayDefectQty: defectQty,
      defectRate: totalQty > 0 ? ((defectQty / totalQty) * 100).toFixed(1) : "0.0",
      openRepairs: 0,
      failedChecks: 0,
      equipmentAvailability:
        equipments.length > 0 ? (availabilityTotal / equipments.length).toFixed(1) : "0.0",
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
