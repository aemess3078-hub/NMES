"use client"

import { useState, useTransition } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getLoginHistory,
  type LoginHistoryRow,
  type LoginHistoryFilter,
} from "@/lib/actions/user-management.actions"

const FAIL_REASON_LABELS: Record<string, string> = {
  USER_NOT_FOUND: "계정 없음",
  INVALID_PASSWORD: "비밀번호 불일치",
  PENDING_APPROVAL: "승인 대기",
  HOLD: "보류",
  REJECTED: "거부됨",
  INACTIVE: "비활성 계정",
  LOCKED: "잠김",
  DELETED: "삭제됨",
}

const EVENT_CONFIG: Record<string, { label: string; className: string }> = {
  LOGIN_SUCCESS: { label: "성공", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  LOGIN_FAIL: { label: "실패", className: "bg-red-50 text-red-700 border-red-200" },
  LOGOUT: { label: "로그아웃", className: "bg-slate-50 text-slate-600 border-slate-200" },
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "medium" })
}

export function LoginHistoryTable({ initialRows }: { initialRows: LoginHistoryRow[] }) {
  const [rows, setRows] = useState<LoginHistoryRow[]>(initialRows)
  const [search, setSearch] = useState("")
  const [event, setEvent] = useState<"ALL" | "SUCCESS" | "FAIL">("ALL")
  const [days, setDays] = useState<string>("7")
  const [includeInactive, setIncludeInactive] = useState(true)
  const [isPending, startTransition] = useTransition()

  function refetch(next: Partial<LoginHistoryFilter> = {}) {
    const filter: LoginHistoryFilter = {
      search,
      event,
      days: Number(days) || 0,
      ...next,
    }
    startTransition(async () => {
      const data = await getLoginHistory(filter)
      setRows(data)
    })
  }

  const visibleRows = includeInactive ? rows : rows.filter((r) => r.isActiveUser !== false)

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            refetch()
          }}
          className="relative"
        >
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="아이디 / 이름 / 이메일 검색"
            className="h-9 w-[260px] pl-9 text-[14px]"
          />
        </form>

        <Select
          value={event}
          onValueChange={(v) => {
            const next = v as "ALL" | "SUCCESS" | "FAIL"
            setEvent(next)
            refetch({ event: next })
          }}
        >
          <SelectTrigger className="h-9 w-[130px] text-[14px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체</SelectItem>
            <SelectItem value="SUCCESS">성공만</SelectItem>
            <SelectItem value="FAIL">실패만</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={days}
          onValueChange={(v) => {
            setDays(v)
            refetch({ days: Number(v) || 0 })
          }}
        >
          <SelectTrigger className="h-9 w-[130px] text-[14px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">최근 7일</SelectItem>
            <SelectItem value="30">최근 30일</SelectItem>
            <SelectItem value="90">최근 90일</SelectItem>
            <SelectItem value="0">전체 기간</SelectItem>
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="h-4 w-4"
          />
          비활성 사용자 포함
        </label>

        {isPending && <span className="text-[13px] text-muted-foreground">불러오는 중…</span>}
      </div>

      {/* 테이블 */}
      <div className="border rounded-xl overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="border-b bg-muted/30">
              {["일시", "사용자", "아이디", "결과", "사유", "IP", "기기 / 브라우저"].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[14px] text-muted-foreground">
                  접속 기록이 없습니다.
                </td>
              </tr>
            ) : (
              visibleRows.map((r) => {
                const cfg = EVENT_CONFIG[r.eventType] ?? EVENT_CONFIG.LOGOUT
                return (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/10">
                    <td className="px-4 py-2.5 text-[13px] text-muted-foreground whitespace-nowrap">
                      {formatDateTime(r.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 text-[14px]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{r.name ?? "—"}</span>
                        {r.isActiveUser === false && (
                          <span className="text-[11px] rounded bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5">
                            비활성
                          </span>
                        )}
                      </div>
                      {r.email && <div className="text-[12px] text-muted-foreground">{r.email}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] font-mono text-muted-foreground whitespace-nowrap">
                      {r.loginId}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className={`text-[12px] whitespace-nowrap ${cfg.className}`}>
                        {cfg.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-muted-foreground whitespace-nowrap">
                      {r.failReason ? (FAIL_REASON_LABELS[r.failReason] ?? r.failReason) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] font-mono text-muted-foreground whitespace-nowrap">
                      {r.ipAddress ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-muted-foreground max-w-[260px] truncate" title={r.userAgent ?? ""}>
                      {r.userAgent ?? "—"}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-muted-foreground">최근 500건까지 표시됩니다.</p>
    </div>
  )
}
