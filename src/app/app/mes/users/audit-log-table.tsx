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
import { AuditAction } from "@prisma/client"
import {
  getAuditLogs,
  type AuditLogRow,
  type AuditLogFilter,
} from "@/lib/actions/user-management.actions"

const ACTION_CONFIG: Record<string, { label: string; className: string }> = {
  CREATE: { label: "생성", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  UPDATE: { label: "수정", className: "bg-blue-50 text-blue-700 border-blue-200" },
  DELETE: { label: "삭제", className: "bg-red-50 text-red-700 border-red-200" },
  APPROVE: { label: "승인", className: "bg-purple-50 text-purple-700 border-purple-200" },
  REJECT: { label: "반려", className: "bg-amber-50 text-amber-700 border-amber-200" },
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "medium" })
}

export function AuditLogTable({ initialRows }: { initialRows: AuditLogRow[] }) {
  const [rows, setRows] = useState<AuditLogRow[]>(initialRows)
  const [search, setSearch] = useState("")
  const [action, setAction] = useState<AuditAction | "ALL">("ALL")
  const [days, setDays] = useState<string>("30")
  const [isPending, startTransition] = useTransition()

  function refetch(next: Partial<AuditLogFilter> = {}) {
    const filter: AuditLogFilter = {
      search,
      action,
      days: Number(days) || 0,
      ...next,
    }
    startTransition(async () => {
      const data = await getAuditLogs(filter)
      setRows(data)
    })
  }

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
            placeholder="사용자 / 작업 대상 / 이메일 / 메뉴 검색"
            className="h-9 w-[280px] pl-9 text-[14px]"
          />
        </form>

        <Select
          value={action}
          onValueChange={(v) => {
            const next = v as AuditAction | "ALL"
            setAction(next)
            refetch({ action: next })
          }}
        >
          <SelectTrigger className="h-9 w-[130px] text-[14px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체 동작</SelectItem>
            <SelectItem value="CREATE">생성</SelectItem>
            <SelectItem value="UPDATE">수정</SelectItem>
            <SelectItem value="DELETE">삭제</SelectItem>
            <SelectItem value="APPROVE">승인</SelectItem>
            <SelectItem value="REJECT">반려</SelectItem>
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

        {isPending && <span className="text-[13px] text-muted-foreground">불러오는 중…</span>}
      </div>

      {/* 테이블 */}
      <div className="border rounded-xl overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="border-b bg-muted/30">
              {["일시", "사용자", "동작", "대상 유형", "작업 대상", "메뉴", "IP"].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[14px] text-muted-foreground">
                  기록된 이용 로그가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const cfg = ACTION_CONFIG[r.action] ?? { label: r.action, className: "bg-slate-50 text-slate-600 border-slate-200" }
                return (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/10">
                    <td className="px-4 py-2.5 text-[13px] text-muted-foreground whitespace-nowrap">
                      {formatDateTime(r.actedAt)}
                    </td>
                    <td className="px-4 py-2.5 text-[14px]">
                      {r.actorName ?? r.actorLabel ?? <span className="text-muted-foreground">시스템</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className={`text-[12px] whitespace-nowrap ${cfg.className}`}>
                        {cfg.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-muted-foreground whitespace-nowrap">
                      {r.entityType}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] max-w-[280px]">
                      <span className="block truncate" title={r.targetLabel || r.entityId}>
                        {r.targetLabel || (
                          <span className="text-muted-foreground font-mono text-[12px]">
                            {r.entityId ? `ID: ${r.entityId.slice(0, 12)}…` : "—"}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-muted-foreground whitespace-nowrap">
                      {r.menuName ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] font-mono text-muted-foreground whitespace-nowrap">
                      {r.ipAddress ?? "—"}
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
