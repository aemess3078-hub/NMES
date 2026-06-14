"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { ko } from "date-fns/locale"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { EquipmentMonitorGrid } from "@/app/app/mes/equipment-monitor/equipment-monitor-grid"
import type { EquipmentMonitorRow } from "@/lib/actions/equipment-monitor.actions"
import type { EquipmentCardMeta } from "@/app/app/mes/equipment-monitor/equipment-monitor-grid"

// ─── Constants ────────────────────────────────────────────────────────────────

const COMM_DELAY_MS = 3 * 60 * 1000   // 3분 (NCWatch 10초 주기 기준)
const REFRESH_INTERVAL_MS = 30_000     // 30초 자동 갱신

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLatestTimestamp(eq: EquipmentMonitorRow): Date | null {
  const dates = eq.recentTags
    .map((t) => t.timestamp)
    .filter((t): t is Date => t !== null)
    .map((t) => new Date(t).getTime())
  if (dates.length === 0) return null
  return new Date(Math.max(...dates))
}

function getStatusTagValue(eq: EquipmentMonitorRow): string | null {
  return (
    eq.recentTags.find((t) => t.tagCode === "STATUS" || t.displayName === "운전 상태")
      ?.latestValue ?? null
  )
}

function detectAlarm(eq: EquipmentMonitorRow): boolean {
  const statusVal = getStatusTagValue(eq)
  if (statusVal === "알람") return true
  return eq.latestEvent?.eventType === "ALARM" && eq.latestEvent.endedAt === null
}

function detectCommDelay(eq: EquipmentMonitorRow, now: number): boolean {
  if (eq.recentTags.length === 0) return false
  const lastTs = getLatestTimestamp(eq)
  return lastTs !== null && now - lastTs.getTime() > COMM_DELAY_MS
}

function getSortPriority(eq: EquipmentMonitorRow, now: number): number {
  if (detectAlarm(eq)) return 0
  if (detectCommDelay(eq, now)) return 1
  const v = getStatusTagValue(eq)
  if (v && ["정지", "오프라인", "일시정지"].includes(v)) return 2
  if (v === "수동") return 3
  if (v === "대기") return 4
  return 5  // 정상 가동
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  data: EquipmentMonitorRow[]
}

export function RealtimeMonitorClient({ data }: Props) {
  const router = useRouter()
  const [lastRefresh, setLastRefresh] = useState(() => new Date())
  const [now, setNow] = useState(() => Date.now())

  // 30초 자동 갱신
  useEffect(() => {
    const id = setInterval(() => {
      router.refresh()
      setLastRefresh(new Date())
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [router])

  // 통신지연 감지를 위한 현재 시각 갱신 (10초)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(id)
  }, [])

  // 각 설비에 메타 부착 및 우선순위 정렬
  const classified = data
    .map((eq) => ({
      eq,
      isAlarm:    detectAlarm(eq),
      isDelay:    detectCommDelay(eq, now),
      priority:   getSortPriority(eq, now),
      lastTs:     getLatestTimestamp(eq),
      statusVal:  getStatusTagValue(eq),
    }))
    .sort((a, b) => a.priority - b.priority)

  const sortedData: EquipmentMonitorRow[] = classified.map((c) => c.eq)
  const metaList: EquipmentCardMeta[] = classified.map((c) => ({
    id: c.eq.id,
    isAlarm: c.isAlarm,
    isDelay: c.isDelay,
    lastTimestamp: c.lastTs,
  }))

  // KPI 집계
  const total      = data.length
  const alarmCount = classified.filter((c) => c.isAlarm).length
  const delayCount = classified.filter((c) => !c.isAlarm && c.isDelay).length
  const runningCount = classified.filter((c) => {
    if (c.isAlarm || c.isDelay) return false
    if (c.statusVal === "가동") return true
    if (!c.statusVal) {
      // NCWatch 없음 → EquipmentEvent 기반
      return c.eq.latestEvent?.eventType === "RUN" && c.eq.latestEvent.endedAt === null
    }
    return false
  }).length
  const stoppedCount = total - alarmCount - delayCount - runningCount

  // 활성 알람 목록
  const activeAlarms = classified.filter((c) => c.isAlarm)

  const kpiItems = [
    { label: "전체",   value: total,        bg: "bg-slate-50",  border: "border-slate-200",  text: "text-slate-700"  },
    { label: "가동",   value: runningCount,  bg: "bg-green-50",  border: "border-green-200",  text: "text-green-700"  },
    { label: "비가동", value: stoppedCount,  bg: "bg-slate-50",  border: "border-slate-200",  text: "text-slate-500"  },
    { label: "알람",   value: alarmCount,    bg: "bg-red-50",    border: "border-red-200",    text: "text-red-700"    },
    { label: "통신지연", value: delayCount,  bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-700"  },
  ]

  return (
    <div className="space-y-4">
      {/* 자동 갱신 표시 */}
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <RefreshCw className="h-3.5 w-3.5" />
        <span>30초마다 자동 갱신</span>
        <span className="text-muted-foreground/50">·</span>
        <span>마지막: {format(lastRefresh, "HH:mm:ss")}</span>
      </div>

      {/* KPI 칩 */}
      <div className="flex gap-2.5 flex-wrap">
        {kpiItems.map((item) => (
          <div
            key={item.label}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${item.bg} ${item.border}`}
          >
            <span className="text-[13px] text-muted-foreground">{item.label}</span>
            <span className={`text-[24px] font-semibold leading-none ${item.text}`}>
              {item.value}
            </span>
          </div>
        ))}
      </div>

      {/* 활성 알람 배너 */}
      {activeAlarms.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <div className="flex items-center gap-2 mb-2.5">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="text-[14px] font-semibold text-red-700">
              활성 알람 {activeAlarms.length}건
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeAlarms.map(({ eq }) => (
              <div
                key={eq.id}
                className="flex items-center gap-2 bg-white rounded-md px-3 py-1.5 border border-red-200"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                <span className="text-[13px] font-medium">{eq.name}</span>
                {eq.latestEvent && (
                  <span className="text-[12px] text-muted-foreground">
                    {format(new Date(eq.latestEvent.startedAt), "HH:mm", { locale: ko })} 발생
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 설비 카드 그리드 */}
      <EquipmentMonitorGrid
        data={sortedData}
        equipmentMeta={metaList}
      />
    </div>
  )
}
