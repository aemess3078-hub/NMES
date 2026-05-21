"use client"

import { useMemo, useState } from "react"
import { Clock, Factory, PackageCheck, Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { type PopWorkQueueRow } from "@/lib/actions/pop.actions"

type QueueFilter = "ALL" | "PENDING" | "IN_PROGRESS" | "AVAILABLE" | "BLOCKED"

const FILTERS: { label: string; value: QueueFilter }[] = [
  { label: "전체", value: "ALL" },
  { label: "대기", value: "PENDING" },
  { label: "진행중", value: "IN_PROGRESS" },
  { label: "작업가능", value: "AVAILABLE" },
  { label: "작업불가", value: "BLOCKED" },
]

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: { label: "대기", className: "border-slate-200 bg-slate-100 text-slate-700" },
  IN_PROGRESS: { label: "진행중", className: "border-amber-200 bg-amber-100 text-amber-800" },
  COMPLETED: { label: "완료", className: "border-green-200 bg-green-100 text-green-800" },
  CANCELLED: { label: "취소", className: "border-red-200 bg-red-100 text-red-700" },
  SKIPPED: { label: "건너뜀", className: "border-zinc-200 bg-zinc-100 text-zinc-700" },
}

function displayProcessName(processName: string): string {
  return processName.includes("후처리") ? "후처리공정" : processName
}

function formatDate(value: string | null): string {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toISOString().slice(0, 10)
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status]
  return (
    <Badge
      variant="outline"
      className={`px-3 py-1 text-[14px] ${config?.className ?? "border-slate-200 bg-slate-100 text-slate-700"}`}
    >
      {config?.label ?? (status || "미정")}
    </Badge>
  )
}

function AvailabilityBadge({ row }: { row: PopWorkQueueRow }) {
  if (row.status === "IN_PROGRESS") {
    return (
      <Badge className="bg-amber-500 px-3 py-1 text-[14px] text-white hover:bg-amber-500">
        진행중
      </Badge>
    )
  }

  if (row.canWork) {
    return (
      <Badge className="bg-emerald-500 px-3 py-1 text-[14px] text-white hover:bg-emerald-500">
        작업가능
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="border-slate-300 bg-white px-3 py-1 text-[14px] text-slate-500">
      이전 공정 대기
    </Badge>
  )
}

function MaterialLotStatus({ row }: { row: PopWorkQueueRow }) {
  if (row.materialLotCount === 0) {
    return <span className="text-[15px] font-medium text-slate-500">미투입</span>
  }

  return (
    <span className="text-[15px] font-semibold text-emerald-700">
      {row.materialLotCount}개 LOT 투입
    </span>
  )
}

export function WorkQueueClient({ rows }: { rows: PopWorkQueueRow[] }) {
  const [filter, setFilter] = useState<QueueFilter>("ALL")
  const [keyword, setKeyword] = useState("")

  const filteredRows = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()

    return rows.filter((row) => {
      const matchesFilter =
        filter === "ALL" ||
        (filter === "PENDING" && row.status === "PENDING") ||
        (filter === "IN_PROGRESS" && row.status === "IN_PROGRESS") ||
        (filter === "AVAILABLE" && row.canWork) ||
        (filter === "BLOCKED" && !row.canWork)

      if (!matchesFilter) return false
      if (!normalizedKeyword) return true

      return [
        row.orderNo,
        row.manufacturingNo ?? "",
        row.itemCode,
        row.itemName,
        displayProcessName(row.processName),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedKeyword)
    })
  }, [filter, keyword, rows])

  const availableCount = rows.filter((row) => row.canWork).length
  const inProgressCount = rows.filter((row) => row.status === "IN_PROGRESS").length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border bg-white p-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[15px] font-medium text-slate-500">POP</p>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight text-slate-900">
            POP 작업대기
          </h1>
          <p className="mt-2 text-[16px] text-slate-500">
            작업자가 수행해야 할 작업지시와 공정 단위 대기 목록을 확인합니다.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-slate-50 px-4 py-3">
            <p className="text-[13px] text-slate-500">전체</p>
            <p className="text-[24px] font-bold text-slate-900">{rows.length}</p>
          </div>
          <div className="rounded-lg border bg-emerald-50 px-4 py-3">
            <p className="text-[13px] text-emerald-700">작업가능</p>
            <p className="text-[24px] font-bold text-emerald-800">{availableCount}</p>
          </div>
          <div className="rounded-lg border bg-amber-50 px-4 py-3">
            <p className="text-[13px] text-amber-700">진행중</p>
            <p className="text-[24px] font-bold text-amber-800">{inProgressCount}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <Button
                key={item.value}
                type="button"
                variant={filter === item.value ? "default" : "outline"}
                size="lg"
                className="h-11 text-[15px]"
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <div className="relative min-w-0 xl:w-[360px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="작업지시번호, 제조번호, 품목, 공정 검색"
              className="h-11 pl-9 text-[15px]"
            />
          </div>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-slate-50 px-6 py-16 text-center">
          <Factory className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <p className="text-[18px] font-semibold text-slate-700">표시할 작업대기 공정이 없습니다.</p>
          <p className="mt-2 text-[15px] text-slate-500">필터나 검색어를 변경해 주세요.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredRows.map((row) => {
            const progress =
              row.plannedQty > 0
                ? Math.min(100, Math.round((row.completedQty / row.plannedQty) * 100))
                : 0

            return (
              <article
                key={row.operationId}
                className={`rounded-xl border bg-white p-5 shadow-sm transition-colors ${
                  row.canWork ? "border-emerald-200" : "border-slate-200"
                }`}
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <AvailabilityBadge row={row} />
                      <StatusBadge status={row.status} />
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[14px] font-medium text-slate-600">
                        {row.seq}공정
                      </span>
                    </div>
                    <div>
                      <p className="font-mono text-[16px] font-semibold text-slate-700">
                        {row.orderNo}
                      </p>
                      <h2 className="mt-1 text-[23px] font-bold text-slate-950">
                        {displayProcessName(row.processName)}
                      </h2>
                      <p className="mt-1 text-[16px] text-slate-500">
                        [{row.itemCode}] {row.itemName}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:w-[460px]">
                    <div className="rounded-lg bg-slate-50 px-4 py-3">
                      <p className="text-[13px] text-slate-500">제조번호</p>
                      <p className="mt-1 truncate font-mono text-[16px] font-semibold text-blue-700">
                        {row.manufacturingNo ?? "-"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-4 py-3">
                      <p className="text-[13px] text-slate-500">납기일</p>
                      <p className="mt-1 text-[16px] font-semibold text-slate-800">
                        {formatDate(row.dueDate)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-lg border bg-white p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-slate-400" />
                      <p className="text-[15px] font-semibold text-slate-800">수량 진행</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-[13px] text-slate-500">계획</p>
                        <p className="text-[20px] font-bold tabular-nums text-slate-900">
                          {row.plannedQty.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[13px] text-slate-500">완료</p>
                        <p className="text-[20px] font-bold tabular-nums text-emerald-700">
                          {row.completedQty.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[13px] text-slate-500">잔여</p>
                        <p className="text-[20px] font-bold tabular-nums text-amber-700">
                          {row.remainingQty.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 h-3 rounded-full bg-slate-100">
                      <div
                        className="h-3 rounded-full bg-blue-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border bg-white p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <PackageCheck className="h-4 w-4 text-slate-400" />
                      <p className="text-[15px] font-semibold text-slate-800">원자재 LOT 투입</p>
                    </div>
                    <MaterialLotStatus row={row} />
                    {row.materialLotCount > 0 && (
                      <p className="mt-2 text-[14px] text-slate-500">
                        총 투입수량 {row.materialLotQty.toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
