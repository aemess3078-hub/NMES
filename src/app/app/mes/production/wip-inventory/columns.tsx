"use client"

import { ColumnDef } from "@tanstack/react-table"
import { OperationStatus } from "@prisma/client"
import { format } from "date-fns"

import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/components/common/data-table"
import type { WipInventoryRow } from "@/lib/actions/work-order.actions"

export const STATUS_CONFIG: Record<
  OperationStatus,
  { label: string; className: string }
> = {
  PENDING: {
    label: "대기",
    className: "border-slate-200 bg-slate-50 text-slate-700",
  },
  IN_PROGRESS: {
    label: "진행중",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  COMPLETED: {
    label: "완료",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  SKIPPED: {
    label: "건너뜀",
    className: "border-zinc-200 bg-zinc-50 text-zinc-700",
  },
}

export function getDisplayRemainingQty(row: WipInventoryRow) {
  return Math.max(0, row.remainingQty)
}

export function getProgress(row: WipInventoryRow) {
  if (row.plannedQty <= 0) return 0
  return (row.productionQty / row.plannedQty) * 100
}

export function isDelayed(row: WipInventoryRow) {
  if (row.status === "COMPLETED" || row.remainingQty <= 0 || !row.workOrder.dueDate) {
    return false
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueDate = new Date(row.workOrder.dueDate)
  dueDate.setHours(0, 0, 0, 0)
  return dueDate < today
}

export function isNearDue(row: WipInventoryRow) {
  if (row.status === "COMPLETED" || row.remainingQty <= 0 || !row.workOrder.dueDate) {
    return false
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueDate = new Date(row.workOrder.dueDate)
  dueDate.setHours(0, 0, 0, 0)
  const diffDays = (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  return diffDays >= 0 && diffDays <= 3
}

export function getColumns(): ColumnDef<WipInventoryRow>[] {
  return [
    {
      id: "orderNo",
      accessorFn: (row) => row.workOrder.orderNo,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="작업지시" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-[13px] font-semibold text-primary whitespace-nowrap">
          {row.original.workOrder.orderNo}
        </span>
      ),
    },
    {
      id: "item",
      accessorFn: (row) => row.workOrder.item.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="품목" />
      ),
      cell: ({ row }) => (
        <div className="min-w-0 max-w-[160px]">
          <p className="text-[14px] font-medium text-foreground leading-snug line-clamp-2">
            {row.original.workOrder.item.name}
          </p>
          <p className="font-mono text-[12px] text-muted-foreground mt-0.5">
            {row.original.workOrder.item.code}
          </p>
        </div>
      ),
    },
    {
      id: "operation",
      accessorFn: (row) => row.routingOperation.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="공정/작업장" />
      ),
      cell: ({ row }) => (
        <div className="min-w-0 max-w-[150px]">
          <p className="truncate text-[14px] font-medium text-foreground">
            <span className="text-muted-foreground mr-1">{row.original.seq}.</span>
            {row.original.routingOperation.name}
          </p>
          <p className="truncate text-[12px] text-muted-foreground">
            {row.original.routingOperation.workCenter.name}
          </p>
        </div>
      ),
    },
    {
      id: "quantitySummary",
      accessorFn: (row) => row.productionQty,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="수량 현황" />
      ),
      cell: ({ row }) => {
        const remaining = getDisplayRemainingQty(row.original)
        const isOver = row.original.remainingQty < 0
        return (
          <div className="text-right">
            <p className="text-[14px] font-medium tabular-nums whitespace-nowrap">
              <span className="text-emerald-700">
                {row.original.productionQty.toLocaleString()}
              </span>
              <span className="text-muted-foreground mx-1">/</span>
              <span className="text-foreground">
                {row.original.plannedQty.toLocaleString()}
              </span>
            </p>
            {remaining > 0 && !isOver ? (
              <p className="text-[12px] text-amber-700 tabular-nums">
                잔량 {remaining.toLocaleString()}
              </p>
            ) : null}
            {isOver ? (
              <Badge
                variant="outline"
                className="border-red-200 bg-red-50 text-[11px] text-red-700"
              >
                수량 확인
              </Badge>
            ) : null}
          </div>
        )
      },
    },
    {
      id: "progress",
      accessorFn: (row) => getProgress(row),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="진행 현황" />
      ),
      cell: ({ row }) => {
        const progress = getProgress(row.original)
        const displayProgress = Math.min(progress, 100)
        const config = STATUS_CONFIG[row.original.status]
        return (
          <div className="w-[130px]">
            <div className="flex items-center justify-between mb-1">
              <Badge
                variant="outline"
                className={`text-[11px] ${config.className}`}
              >
                {config.label}
              </Badge>
              <span className="text-[12px] font-medium tabular-nums">
                {Math.round(displayProgress)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${displayProgress}%` }}
              />
            </div>
            {progress > 100 ? (
              <p className="mt-0.5 text-right text-[11px] text-red-600">초과</p>
            ) : null}
          </div>
        )
      },
    },
    {
      id: "activeWipQty",
      accessorFn: (row) => row.activeWipQty,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="재공수량" />
      ),
      cell: ({ row }) => (
        <div className="text-right">
          <span className="block text-[14px] font-medium tabular-nums">
            {row.original.activeWipQty.toLocaleString()}
          </span>
          {row.original.wipLocations.length > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {row.original.wipLocations[0].name}
              {row.original.wipLocations.length > 1
                ? ` 외 ${row.original.wipLocations.length - 1}`
                : ""}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "schedule",
      accessorFn: (row) =>
        row.workOrder.dueDate ? new Date(row.workOrder.dueDate).getTime() : 0,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="일정" />
      ),
      cell: ({ row }) => {
        const dueDate = row.original.workOrder.dueDate
        if (!dueDate) {
          return <span className="text-[13px] text-muted-foreground">-</span>
        }
        const delayed = isDelayed(row.original)
        const nearDue = isNearDue(row.original)
        return (
          <div className="whitespace-nowrap">
            <p
              className={`text-[13px] font-medium ${
                delayed ? "text-red-600" : "text-foreground"
              }`}
            >
              {format(new Date(dueDate), "yyyy-MM-dd")}
            </p>
            {delayed ? (
              <Badge
                variant="outline"
                className="mt-0.5 border-red-200 bg-red-50 text-[11px] text-red-700"
              >
                지연
              </Badge>
            ) : nearDue ? (
              <Badge
                variant="outline"
                className="mt-0.5 border-amber-200 bg-amber-50 text-[11px] text-amber-700"
              >
                임박
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="mt-0.5 border-emerald-200 bg-emerald-50 text-[11px] text-emerald-700"
              >
                정상
              </Badge>
            )}
          </div>
        )
      },
    },
  ]
}
