"use server"

import { prisma } from "@/lib/db/prisma"
import { getTenantId } from "@/lib/auth"
import { isMissingDbObjectError } from "@/lib/db/prisma-error"

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnalysisPeriod = "today" | "week" | "month"

function getDateRange(period: AnalysisPeriod): { from: Date; to: Date; label: string } {
  const now = new Date()
  const to = new Date(now)
  to.setHours(23, 59, 59, 999)

  if (period === "today") {
    const from = new Date(now)
    from.setHours(0, 0, 0, 0)
    return { from, to, label: "오늘" }
  }
  if (period === "week") {
    const from = new Date(now)
    from.setDate(from.getDate() - 6)
    from.setHours(0, 0, 0, 0)
    return { from, to, label: "최근 7일" }
  }
  // month
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  return { from, to, label: "이번 달" }
}

// "HH:MM:SS" → minutes
function parseTimeToMinutes(t: string | null | undefined): number {
  if (!t) return 0
  const parts = t.split(":").map(Number)
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0)
}

function fmtMins(mins: number): number {
  return Math.round(mins)
}

export type EquipmentAnalysisRow = {
  equipmentId: string
  equipmentCode: string
  equipmentName: string
  runMinutes: number
  stopMinutes: number
  manualMinutes: number
  alarmMinutes: number
  offlineMinutes: number
  totalMinutes: number
  runRate: number | null    // 0–100 (%)
  alarmRate: number | null  // 0–100 (%)
  alarmCount: number
  source: "ncwatch" | "event" | "none"
}

export type EquipmentAnalysisData = {
  period: AnalysisPeriod
  periodLabel: string
  rows: EquipmentAnalysisRow[]
  hasNcwatchData: boolean
}

export async function getEquipmentAnalysisData(
  period: AnalysisPeriod = "today"
): Promise<EquipmentAnalysisData> {
  const tenantId = await getTenantId()
  const { from, to, label } = getDateRange(period)

  try {
    // 1. 설비 목록 + NCWatch 매핑 (protocol 컬럼 미접근 — enum 역직렬화 위험 없음)
    const equipments = await prisma.equipment.findMany({
      where: { tenantId },
      select: {
        id: true,
        code: true,
        name: true,
        ncwatchMappings: {
          where: { isActive: true },
          select: { machineName: true },
          take: 1,
        },
      },
      orderBy: { code: "asc" },
    })

    if (equipments.length === 0) {
      return { period, periodLabel: label, rows: [], hasNcwatchData: false }
    }

    const equipmentIds = equipments.map((e) => e.id)

    // machineName → equipment 역참조
    const machineToEq = new Map<string, { id: string; code: string; name: string }>()
    for (const eq of equipments) {
      const m = eq.ncwatchMappings[0]
      if (m?.machineName) machineToEq.set(m.machineName, { id: eq.id, code: eq.code, name: eq.name })
    }

    // 2. NcwatchReportDaily 집계 (없으면 조용히 skip)
    let hasNcwatchData = false
    const ncwatchMap = new Map<
      string,
      { run: number; stop: number; manual: number; alarm: number; offline: number }
    >()

    if (machineToEq.size > 0) {
      try {
        const reports = await prisma.ncwatchReportDaily.findMany({
          where: {
            tenantId,
            machineName: { in: Array.from(machineToEq.keys()) },
            reportDate: { gte: from, lte: to },
          },
          select: {
            machineName: true,
            runTime: true,
            stopTime: true,
            manualTime: true,
            alarmTime: true,
            offlineTime: true,
          },
        })
        for (const r of reports) {
          const cur = ncwatchMap.get(r.machineName) ?? { run: 0, stop: 0, manual: 0, alarm: 0, offline: 0 }
          cur.run    += parseTimeToMinutes(r.runTime)
          cur.stop   += parseTimeToMinutes(r.stopTime)
          cur.manual += parseTimeToMinutes(r.manualTime)
          cur.alarm  += parseTimeToMinutes(r.alarmTime)
          cur.offline += parseTimeToMinutes(r.offlineTime)
          ncwatchMap.set(r.machineName, cur)
        }
        hasNcwatchData = reports.length > 0
      } catch {
        // 테이블 미존재 등 — 폴백 진행
      }
    }

    // 3. EquipmentEvent 알람 횟수/시간 (기간 내)
    const alarmEvents = await prisma.equipmentEvent.findMany({
      where: {
        equipmentId: { in: equipmentIds },
        eventType: "ALARM",
        startedAt: { gte: from, lte: to },
      },
      select: {
        equipmentId: true,
        duration: true,
        startedAt: true,
        endedAt: true,
      },
    })

    const alarmMap = new Map<string, { count: number; minutes: number }>()
    for (const ev of alarmEvents) {
      const cur = alarmMap.get(ev.equipmentId) ?? { count: 0, minutes: 0 }
      cur.count++
      if (ev.duration != null) cur.minutes += ev.duration / 60
      else if (ev.endedAt && ev.startedAt)
        cur.minutes += (ev.endedAt.getTime() - ev.startedAt.getTime()) / 60_000
      alarmMap.set(ev.equipmentId, cur)
    }

    // 4. NCWatch 데이터가 없을 때 EquipmentEvent RUN 기반 폴백
    const eventRunMap = new Map<string, number>()
    if (!hasNcwatchData) {
      const runEvents = await prisma.equipmentEvent.findMany({
        where: {
          equipmentId: { in: equipmentIds },
          eventType: "RUN",
          startedAt: { gte: from, lte: to },
        },
        select: {
          equipmentId: true,
          duration: true,
          startedAt: true,
          endedAt: true,
        },
      })
      for (const ev of runEvents) {
        const mins =
          ev.duration != null
            ? ev.duration / 60
            : ev.endedAt && ev.startedAt
            ? (ev.endedAt.getTime() - ev.startedAt.getTime()) / 60_000
            : 0
        eventRunMap.set(ev.equipmentId, (eventRunMap.get(ev.equipmentId) ?? 0) + mins)
      }
    }

    // 5. 결과 조립
    const totalPeriodMins = (to.getTime() - from.getTime()) / 60_000
    const rows: EquipmentAnalysisRow[] = equipments.map((eq) => {
      const mapping = eq.ncwatchMappings[0]
      const ncwatch = mapping ? ncwatchMap.get(mapping.machineName) : null
      const alarm = alarmMap.get(eq.id) ?? { count: 0, minutes: 0 }

      if (ncwatch) {
        const total = ncwatch.run + ncwatch.stop + ncwatch.manual + ncwatch.alarm + ncwatch.offline
        return {
          equipmentId: eq.id,
          equipmentCode: eq.code,
          equipmentName: eq.name,
          runMinutes:     fmtMins(ncwatch.run),
          stopMinutes:    fmtMins(ncwatch.stop),
          manualMinutes:  fmtMins(ncwatch.manual),
          alarmMinutes:   fmtMins(ncwatch.alarm),
          offlineMinutes: fmtMins(ncwatch.offline),
          totalMinutes:   fmtMins(total),
          runRate:   total > 0 ? Math.round((ncwatch.run  / total) * 1000) / 10 : null,
          alarmRate: total > 0 ? Math.round((ncwatch.alarm / total) * 1000) / 10 : null,
          alarmCount: alarm.count,
          source: "ncwatch",
        }
      }

      const runMins = eventRunMap.get(eq.id) ?? 0
      if (runMins === 0 && alarm.count === 0) {
        return {
          equipmentId: eq.id,
          equipmentCode: eq.code,
          equipmentName: eq.name,
          runMinutes: 0, stopMinutes: 0, manualMinutes: 0, alarmMinutes: 0, offlineMinutes: 0,
          totalMinutes: 0,
          runRate: null, alarmRate: null,
          alarmCount: 0,
          source: "none",
        }
      }

      return {
        equipmentId: eq.id,
        equipmentCode: eq.code,
        equipmentName: eq.name,
        runMinutes:     fmtMins(runMins),
        stopMinutes:    0,
        manualMinutes:  0,
        alarmMinutes:   fmtMins(alarm.minutes),
        offlineMinutes: 0,
        totalMinutes:   fmtMins(totalPeriodMins),
        runRate:   totalPeriodMins > 0 ? Math.round((runMins / totalPeriodMins) * 1000) / 10 : null,
        alarmRate: totalPeriodMins > 0 ? Math.round((alarm.minutes / totalPeriodMins) * 1000) / 10 : null,
        alarmCount: alarm.count,
        source: "event",
      }
    })

    return { period, periodLabel: label, rows, hasNcwatchData }
  } catch (error) {
    if (isMissingDbObjectError(error)) {
      return { period, periodLabel: label, rows: [], hasNcwatchData: false }
    }
    throw error
  }
}
