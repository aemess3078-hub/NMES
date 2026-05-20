"use client"

import { Fragment, useMemo, useState } from "react"
import {
  ColumnDef,
  ExpandedState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { ChevronDown, ChevronUp, Search } from "lucide-react"
import { format } from "date-fns"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { WipInventoryRow } from "@/lib/actions/work-order.actions"
import {
  getColumns,
  STATUS_CONFIG,
  getDisplayRemainingQty,
  getProgress,
  isDelayed,
  isNearDue,
} from "./columns"

interface WipInventoryDataTableProps {
  data: WipInventoryRow[]
}

const STATUS_OPTIONS = [
  { label: "전체", value: "" },
  { label: "대기", value: "PENDING" },
  { label: "진행중", value: "IN_PROGRESS" },
  { label: "완료", value: "COMPLETED" },
  { label: "건너뜀", value: "SKIPPED" },
]

export function WipInventoryDataTable({ data }: WipInventoryDataTableProps) {
  const [keyword, setKeyword] = useState("")
  const [startDateFrom, setStartDateFrom] = useState("")
  const [startDateTo, setStartDateTo] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [sorting, setSorting] = useState<SortingState>([])
  const [expanded, setExpanded] = useState<ExpandedState>({})

  const filteredData = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    const fromTime = startDateFrom
      ? new Date(`${startDateFrom}T00:00:00`).getTime()
      : null
    const toTime = startDateTo
      ? new Date(`${startDateTo}T23:59:59`).getTime()
      : null

    return data.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false

      const baseDate = new Date(
        row.startedAt ?? row.workOrder.createdAt
      ).getTime()
      if (fromTime !== null && baseDate < fromTime) return false
      if (toTime !== null && baseDate > toTime) return false

      if (kw.length > 0) {
        const haystack = [
          row.workOrder.orderNo,
          row.workOrder.item.code,
          row.workOrder.item.name,
          row.routingOperation.operationCode,
          row.routingOperation.name,
          row.routingOperation.workCenter.name,
          row.equipment?.code ?? "",
          row.equipment?.name ?? "",
          ...row.wipLocations.flatMap((l) => [l.code, l.name]),
        ]
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(kw)) return false
      }

      return true
    })
  }, [data, keyword, startDateFrom, startDateTo, statusFilter])

  const baseColumns = useMemo(() => getColumns(), [])

  const allColumns = useMemo<ColumnDef<WipInventoryRow>[]>(
    () => [
      ...baseColumns,
      {
        id: "_expand",
        header: () => null,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              row.toggleExpanded()
            }}
          >
            {row.getIsExpanded() ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        ),
      },
    ],
    [baseColumns]
  )

  const table = useReactTable({
    data: filteredData,
    columns: allColumns,
    state: { sorting, expanded },
    onSortingChange: setSorting,
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
    initialState: { pagination: { pageSize: 20 } },
  })

  return (
    <div className="space-y-4">
      {/* 검색 / 날짜 필터 */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="작업지시 / 품목 / 공정 / 작업장 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="h-9 w-[340px] pl-9 text-[14px]"
          />
        </div>
        <label className="space-y-1">
          <span className="block text-[13px] text-muted-foreground">
            시작일 시작
          </span>
          <Input
            type="date"
            value={startDateFrom}
            onChange={(e) => setStartDateFrom(e.target.value)}
            className="h-9 w-[150px] text-[14px]"
          />
        </label>
        <label className="space-y-1">
          <span className="block text-[13px] text-muted-foreground">
            시작일 종료
          </span>
          <Input
            type="date"
            value={startDateTo}
            onChange={(e) => setStartDateTo(e.target.value)}
            className="h-9 w-[150px] text-[14px]"
          />
        </label>
      </div>

      {/* 상태 필터 */}
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setStatusFilter(opt.value)}
            className={`rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${
              statusFilter === opt.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:border-primary/60 hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <Fragment key={row.id}>
                  <TableRow
                    className={
                      row.getIsExpanded()
                        ? "border-b-0 bg-muted/20 hover:bg-muted/20"
                        : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  {row.getIsExpanded() ? (
                    <TableRow className="bg-muted/10 hover:bg-muted/10">
                      <TableCell
                        colSpan={allColumns.length}
                        className="px-4 py-3"
                      >
                        <ExpandedDetail row={row.original} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={allColumns.length}
                  className="h-24 text-center text-[15px] text-muted-foreground"
                >
                  데이터가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* 페이지네이션 */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">
          총 {filteredData.length.toLocaleString()}건
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[13px]"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            이전
          </Button>
          <span className="text-[13px] text-muted-foreground">
            {table.getState().pagination.pageIndex + 1} /{" "}
            {Math.max(1, table.getPageCount())}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[13px]"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            다음
          </Button>
        </div>
      </div>
    </div>
  )
}

function ExpandedDetail({ row }: { row: WipInventoryRow }) {
  const remaining = getDisplayRemainingQty(row)
  const isOver = row.remainingQty < 0
  const progress = getProgress(row)
  const delayed = isDelayed(row)
  const nearDue = isNearDue(row)
  const config = STATUS_CONFIG[row.status]
  const dueDate = row.workOrder.dueDate

  const dueDateStatus = delayed
    ? { label: "지연", className: "border-red-200 bg-red-50 text-red-700" }
    : nearDue
    ? { label: "임박", className: "border-amber-200 bg-amber-50 text-amber-700" }
    : { label: "정상", className: "border-emerald-200 bg-emerald-50 text-emerald-700" }

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {/* 공정/작업장 */}
      <div className="rounded-lg border border-border bg-background p-3 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          공정 / 작업장
        </p>
        <dl className="space-y-1.5">
          <DetailRow label="현재공정" value={`${row.seq}. ${row.routingOperation.name}`} />
          <DetailRow label="공정코드" value={row.routingOperation.operationCode} mono />
          <DetailRow label="작업장" value={row.routingOperation.workCenter.name} />
          <DetailRow label="설비" value={row.equipment?.name ?? "설비 미지정"} />
        </dl>
      </div>

      {/* 수량 현황 */}
      <div className="rounded-lg border border-border bg-background p-3 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          수량 현황
        </p>
        <dl className="space-y-1.5">
          <DetailRow label="지시수량" value={row.plannedQty.toLocaleString()} />
          <DetailRow
            label="완료수량"
            value={row.productionQty.toLocaleString()}
            accent="emerald"
          />
          <DetailRow
            label="잔량"
            value={remaining.toLocaleString()}
            accent={remaining > 0 ? "amber" : "emerald"}
          />
        </dl>
        {isOver ? (
          <Badge
            variant="outline"
            className="border-red-200 bg-red-50 text-[11px] text-red-700"
          >
            수량 확인
          </Badge>
        ) : null}
      </div>

      {/* 진행 현황 */}
      <div className="rounded-lg border border-border bg-background p-3 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          진행 현황
        </p>
        <dl className="space-y-1.5">
          <DetailRow label="진행률" value={`${Math.round(progress)}%`} />
        </dl>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
        <dl className="space-y-1.5">
          <div className="flex items-center justify-between text-[13px]">
            <dt className="text-muted-foreground">진행상태</dt>
            <dd>
              <Badge
                variant="outline"
                className={`text-[11px] ${config.className}`}
              >
                {config.label}
              </Badge>
            </dd>
          </div>
          {progress > 100 ? (
            <div className="flex items-center justify-between text-[13px]">
              <dt className="text-muted-foreground">초과 여부</dt>
              <dd className="font-medium text-red-600">초과</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {/* 일정 */}
      <div className="rounded-lg border border-border bg-background p-3 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          일정
        </p>
        <dl className="space-y-1.5">
          <DetailRow
            label={row.startedAt ? "시작일" : "지시일"}
            value={format(
              new Date(row.startedAt ?? row.workOrder.createdAt),
              "yyyy-MM-dd"
            )}
          />
          <DetailRow
            label="납기일"
            value={
              dueDate ? format(new Date(dueDate), "yyyy-MM-dd") : "-"
            }
            accent={delayed ? "red" : undefined}
          />
          {dueDate ? (
            <div className="flex items-center justify-between text-[13px]">
              <dt className="text-muted-foreground">납기상태</dt>
              <dd>
                <Badge
                  variant="outline"
                  className={`text-[11px] ${dueDateStatus.className}`}
                >
                  {dueDateStatus.label}
                </Badge>
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </div>
  )
}

function DetailRow({
  label,
  value,
  mono,
  accent,
}: {
  label: string
  value: string
  mono?: boolean
  accent?: "emerald" | "amber" | "red"
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-700"
      : accent === "amber"
      ? "text-amber-700"
      : accent === "red"
      ? "text-red-600"
      : "text-foreground"

  return (
    <div className="flex items-start justify-between gap-2 text-[13px]">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={`text-right font-medium ${mono ? "font-mono" : ""} ${accentClass}`}
      >
        {value}
      </dd>
    </div>
  )
}
