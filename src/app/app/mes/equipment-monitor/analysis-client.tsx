"use client"

import { useTransition } from "react"
import { useRouter, usePathname } from "next/navigation"
import { BarChart2, Info } from "lucide-react"
import type {
  EquipmentAnalysisData,
  EquipmentAnalysisRow,
  AnalysisPeriod,
} from "@/lib/actions/equipment-analysis.actions"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { value: AnalysisPeriod; label: string }[] = [
  { value: "today", label: "오늘" },
  { value: "week",  label: "최근 7일" },
  { value: "month", label: "이번 달" },
]

function fmtMins(mins: number): string {
  if (mins === 0) return "—"
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}분`
  if (m === 0) return `${h}h`
  return `${h}h ${m}분`
}

// ─── Ratio bar ────────────────────────────────────────────────────────────────

function RatioBar({ row }: { row: EquipmentAnalysisRow }) {
  const total = row.totalMinutes
  if (total === 0 || row.source === "none") {
    return <span className="text-[13px] text-muted-foreground">데이터 없음</span>
  }

  const pct = (n: number) => Math.max(0, Math.min(100, (n / total) * 100))
  const runPct     = pct(row.runMinutes)
  const stopPct    = pct(row.stopMinutes)
  const manualPct  = pct(row.manualMinutes)
  const alarmPct   = pct(row.alarmMinutes)
  const offlinePct = pct(row.offlineMinutes)

  return (
    <div className="flex h-3.5 w-36 rounded-full overflow-hidden gap-px bg-slate-100">
      {runPct > 0 && (
        <div
          className="bg-green-500 h-full"
          style={{ width: `${runPct}%` }}
          title={`가동 ${Math.round(runPct)}%`}
        />
      )}
      {stopPct > 0 && (
        <div
          className="bg-slate-300 h-full"
          style={{ width: `${stopPct}%` }}
          title={`정지 ${Math.round(stopPct)}%`}
        />
      )}
      {manualPct > 0 && (
        <div
          className="bg-amber-400 h-full"
          style={{ width: `${manualPct}%` }}
          title={`수동 ${Math.round(manualPct)}%`}
        />
      )}
      {alarmPct > 0 && (
        <div
          className="bg-red-500 h-full"
          style={{ width: `${alarmPct}%` }}
          title={`알람 ${Math.round(alarmPct)}%`}
        />
      )}
      {offlinePct > 0 && (
        <div
          className="bg-slate-500 h-full"
          style={{ width: `${offlinePct}%` }}
          title={`오프라인 ${Math.round(offlinePct)}%`}
        />
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  data: EquipmentAnalysisData
}

export function EquipmentAnalysisClient({ data }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function handlePeriod(period: AnalysisPeriod) {
    startTransition(() => {
      router.push(`${pathname}?period=${period}`)
    })
  }

  const { rows, period, periodLabel, hasNcwatchData } = data

  const withData = rows.filter((r) => r.source !== "none")
  const avgRunRate =
    withData.length > 0
      ? Math.round(
          (withData.reduce((s, r) => s + (r.runRate ?? 0), 0) / withData.length) * 10
        ) / 10
      : null
  const totalAlarms = rows.reduce((s, r) => s + r.alarmCount, 0)

  return (
    <>
      {/* Period filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handlePeriod(opt.value)}
            disabled={isPending}
            className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
              period === opt.value
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <span className="ml-1 text-[13px] text-muted-foreground">기준: {periodLabel}</span>
        {!hasNcwatchData && (
          <span className="ml-auto flex items-center gap-1 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
            <Info className="h-3.5 w-3.5" />
            NCWatch 일간 집계 없음 — 이벤트 기반 집계
          </span>
        )}
      </div>

      {/* Summary KPI */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[13px] text-muted-foreground mb-1">평균 가동률</p>
          <p className="text-[28px] font-semibold text-green-700">
            {avgRunRate !== null ? `${avgRunRate}%` : "—"}
          </p>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            데이터 있는 설비 {withData.length}대 기준
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[13px] text-muted-foreground mb-1">총 알람 발생</p>
          <p className="text-[28px] font-semibold text-red-700">{totalAlarms}건</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">{periodLabel} 누계</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-[13px] text-muted-foreground mb-1">연동 설비</p>
          <p className="text-[28px] font-semibold">
            {withData.length}
            <span className="text-[16px] font-normal text-muted-foreground"> / {rows.length}대</span>
          </p>
          <p className="text-[12px] text-muted-foreground mt-0.5">데이터 수신 중</p>
        </div>
      </div>

      {/* Analysis table */}
      {rows.length === 0 ? (
        <div className="rounded-lg border bg-card py-16 text-center">
          <BarChart2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-[15px] text-muted-foreground">조회할 설비 데이터가 없습니다.</p>
          <p className="text-[13px] text-muted-foreground mt-1">설비를 등록하거나 기간을 변경해 보세요.</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left py-3 px-4 text-[13px] font-medium text-muted-foreground">설비명</th>
                <th className="text-right py-3 px-4 text-[13px] font-medium text-muted-foreground">가동시간</th>
                <th className="text-right py-3 px-4 text-[13px] font-medium text-muted-foreground">정지시간</th>
                <th className="text-right py-3 px-4 text-[13px] font-medium text-muted-foreground">알람시간</th>
                <th className="text-right py-3 px-4 text-[13px] font-medium text-muted-foreground">알람 횟수</th>
                <th className="text-right py-3 px-4 text-[13px] font-medium text-muted-foreground">가동률</th>
                <th className="py-3 px-4 text-[13px] font-medium text-muted-foreground">상태 비율</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.equipmentId} className={`${i > 0 ? "border-t" : ""} hover:bg-muted/20`}>
                  <td className="py-3 px-4">
                    <p className="text-[14px] font-medium">{row.equipmentName}</p>
                    <p className="text-[12px] text-muted-foreground">{row.equipmentCode}</p>
                  </td>
                  <td className="text-right py-3 px-4 text-[14px] text-green-700">
                    {fmtMins(row.runMinutes)}
                  </td>
                  <td className="text-right py-3 px-4 text-[14px] text-slate-500">
                    {row.source === "event" ? "—" : fmtMins(row.stopMinutes)}
                  </td>
                  <td className="text-right py-3 px-4 text-[14px] text-red-600">
                    {fmtMins(row.alarmMinutes)}
                  </td>
                  <td className="text-right py-3 px-4">
                    {row.alarmCount > 0 ? (
                      <span className="text-[13px] font-semibold text-red-600">{row.alarmCount}회</span>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="text-right py-3 px-4">
                    {row.runRate !== null ? (
                      <span className="text-[14px] font-semibold">{row.runRate}%</span>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <RatioBar row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      {withData.length > 0 && (
        <div className="flex items-center gap-4 text-[12px] text-muted-foreground pt-1">
          <span className="font-medium text-foreground">범례</span>
          {[
            { color: "bg-green-500", label: "가동" },
            { color: "bg-slate-300", label: "정지" },
            { color: "bg-amber-400", label: "수동" },
            { color: "bg-red-500",   label: "알람" },
            { color: "bg-slate-500", label: "오프라인" },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-sm ${color}`} />
              {label}
            </span>
          ))}
        </div>
      )}

      {/* 24h timeline placeholder */}
      <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center">
        <p className="text-[14px] font-medium text-muted-foreground">24시간 가동 타임라인</p>
        <p className="text-[13px] text-muted-foreground mt-1">다음 버전에서 제공 예정</p>
      </div>
    </>
  )
}
