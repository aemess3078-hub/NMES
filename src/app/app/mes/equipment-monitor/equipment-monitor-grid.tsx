"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, CheckCircle2, Clock, Wrench, XCircle } from "lucide-react"
import { EquipmentMonitorRow } from "@/lib/actions/equipment-monitor.actions"
import { format } from "date-fns"
import { ko } from "date-fns/locale"

const STATUS_CONFIG = {
  ACTIVE: { label: "가동중", className: "bg-green-500", textClass: "text-green-700", borderClass: "border-green-200" },
  IDLE: { label: "대기", className: "bg-yellow-400", textClass: "text-yellow-700", borderClass: "border-yellow-200" },
  MAINTENANCE: { label: "점검중", className: "bg-blue-500", textClass: "text-blue-700", borderClass: "border-blue-200" },
  DOWN: { label: "고장", className: "bg-red-500", textClass: "text-red-700", borderClass: "border-red-200" },
  INACTIVE: { label: "비가동", className: "bg-slate-400", textClass: "text-slate-600", borderClass: "border-slate-200" },
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  START: "가동 시작",
  STOP: "가동 정지",
  ALARM: "알람",
  ERROR: "에러",
  MAINTENANCE: "유지보수",
}

function CheckBadge({ result }: { result: string | null }) {
  if (!result) return <span className="text-[13px] text-muted-foreground">—</span>
  if (result === "PASS") return (
    <Badge className="bg-green-100 text-green-700 border-0 text-[12px] gap-1">
      <CheckCircle2 className="h-3 w-3" /> 이상없음
    </Badge>
  )
  if (result === "FAIL") return (
    <Badge className="bg-red-100 text-red-700 border-0 text-[12px] gap-1">
      <XCircle className="h-3 w-3" /> 이상있음
    </Badge>
  )
  return <Badge className="bg-slate-100 text-slate-600 border-0 text-[12px]">해당없음</Badge>
}

interface Props {
  data: EquipmentMonitorRow[]
}

export function EquipmentMonitorGrid({ data }: Props) {
  const [filter, setFilter] = useState<string>("ALL")

  const filtered = filter === "ALL" ? data : data.filter((d) => d.status === filter)

  const statusCounts = data.reduce(
    (acc, eq) => {
      acc[eq.status] = (acc[eq.status] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter("ALL")}
          className={`px-3 py-1 rounded-full text-[13px] font-medium transition-colors ${
            filter === "ALL"
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          전체 ({data.length})
        </button>
        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
          const count = statusCounts[status] ?? 0
          if (count === 0) return null
          return (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-3 py-1 rounded-full text-[13px] font-medium transition-colors ${
                filter === status
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cfg.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Equipment Cards */}
      <div className="grid grid-cols-3 gap-4">
        {filtered.map((eq) => {
          const statusCfg = STATUS_CONFIG[eq.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.INACTIVE
          return (
            <Card key={eq.id} className={`border ${statusCfg.borderClass}`}>
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-[15px] font-semibold">{eq.name}</CardTitle>
                    <p className="text-[13px] text-muted-foreground">{eq.code} · {eq.workCenter.name}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${statusCfg.className} animate-pulse`} />
                    <span className={`text-[13px] font-medium ${statusCfg.textClass}`}>{statusCfg.label}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {/* Real-time tags */}
                {eq.recentTags.length > 0 && (
                  <div className="grid grid-cols-2 gap-1.5 py-2 border-y">
                    {eq.recentTags.map((tag) => (
                      <div key={tag.displayName} className="bg-muted/50 rounded-md px-2 py-1.5">
                        <p className="text-[11px] text-muted-foreground">{tag.displayName}</p>
                        <p className="text-[15px] font-semibold">
                          {tag.latestValue ?? "—"}
                          {tag.unit && <span className="text-[12px] font-normal text-muted-foreground ml-0.5">{tag.unit}</span>}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Latest event */}
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    최근 이벤트
                  </span>
                  <span>
                    {eq.latestEvent
                      ? `${EVENT_TYPE_LABEL[eq.latestEvent.eventType] ?? eq.latestEvent.eventType} · ${format(new Date(eq.latestEvent.startedAt), "MM/dd HH:mm", { locale: ko })}`
                      : "—"}
                  </span>
                </div>

                {/* Daily check */}
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-muted-foreground">일상점검</span>
                  <CheckBadge result={eq.lastCheckResult} />
                </div>

                {/* Open repairs */}
                {eq.openRepairs > 0 && (
                  <div className="flex items-center gap-1.5 text-[13px] text-red-600 bg-red-50 rounded px-2 py-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    수리요청 {eq.openRepairs}건 진행중
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
        {filtered.length === 0 && (
          <div className="col-span-3 text-center py-12 text-[15px] text-muted-foreground">
            해당 상태의 설비가 없습니다.
          </div>
        )}
      </div>
    </div>
  )
}
