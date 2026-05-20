"use client"

import { ColumnDef } from "@tanstack/react-table"
import { OperationStatus } from "@prisma/client"
import { format } from "date-fns"

import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/components/common/data-table"
import type { WipInventoryRow } from "@/lib/actions/work-order.actions"

const STATUS_CONFIG: Record<
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

export function getColumns(): ColumnDef<WipInventoryRow>[] {
  return [
    {
      id: "orderNo",
      accessorFn: (row) => row.workOrder.orderNo,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="작업지시번호" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-[13px] font-medium text-primary">
          {row.original.workOrder.orderNo}
        </span>
      ),
    },
    {
      id: "itemCode",
      accessorFn: (row) => row.workOrder.item.code,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="품목코드" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-[13px] font-medium">
          {row.original.workOrder.item.code}
        </span>
      ),
    },
    {
      id: "itemName",
      accessorFn: (row) => row.workOrder.item.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="품목명" />
      ),
      cell: ({ row }) => (
        <span className="text-[14px] font-medium text-foreground">
          {row.original.workOrder.item.name}
        </span>
      ),
    },
    {
      id: "operationName",
      accessorFn: (row) => row.routingOperation.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="현재공정" />
      ),
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <p className="text-[14px] font-medium text-foreground">
            <span className="mr-1 text-muted-foreground">{row.original.seq}.</span>
            {row.original.routingOperation.name}
          </p>
          <p className="font-mono text-[13px] text-muted-foreground">
            {row.original.routingOperation.operationCode}
          </p>
        </div>
      ),
    },
    {
      id: "workCenter",
      accessorFn: (row) => row.routingOperation.workCenter.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="작업장/라인" />
      ),
      cell: ({ row }) => {
        const equipment = row.original.equipment
        return (
          <div className="space-y-0.5">
            <p className="text-[14px] text-foreground">
              {row.original.routingOperation.workCenter.name}
            </p>
            <p className="text-[13px] text-muted-foreground">
              {equipment ? equipment.name : "설비 미지정"}
            </p>
          </div>
        )
      },
    },
    {
      id: "plannedQty",
      accessorFn: (row) => row.plannedQty,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="지시수량" />
      ),
      cell: ({ row }) => <QuantityCell value={row.original.plannedQty} />,
    },
    {
      id: "productionQty",
      accessorFn: (row) => row.productionQty,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="완료수량" />
      ),
      cell: ({ row }) => <QuantityCell value={row.original.productionQty} />,
    },
    {
      id: "remainingQty",
      accessorFn: (row) => getDisplayRemainingQty(row),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="잔량" />
      ),
      cell: ({ row }) => {
        const rawRemainingQty = row.original.remainingQty
        const remainingQty = getDisplayRemainingQty(row.original)
        return (
          <div className="space-y-1 text-right">
            <span
              className={`block text-[14px] font-medium tabular-nums ${
                remainingQty > 0 ? "text-amber-700" : "text-emerald-700"
              }`}
            >
              {remainingQty.toLocaleString()}
            </span>
            {rawRemainingQty < 0 ? (
              <Badge variant="outline" className="border-red-200 bg-red-50 text-[12px] text-red-700 whitespace-nowrap">
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
        <DataTableColumnHeader column={column} title="진행률" />
      ),
      cell: ({ row }) => {
        const progress = getProgress(row.original)
        const displayProgress = Math.min(progress, 100)
        return (
          <div className="w-32 space-y-1">
            <div className="flex justify-between text-[13px]">
              <span className="text-muted-foreground">
                {row.original.productionQty.toLocaleString()} / {row.original.plannedQty.toLocaleString()}
              </span>
              <span className="font-medium">{Math.round(displayProgress)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${displayProgress}%` }}
              />
            </div>
            {progress > 100 ? (
              <p className="text-right text-[12px] text-red-600 whitespace-nowrap">초과</p>
            ) : null}
          </div>
        )
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="진행상태" />
      ),
      cell: ({ row }) => {
        const config = STATUS_CONFIG[row.original.status]
        return (
          <Badge variant="outline" className={`text-[12px] whitespace-nowrap ${config.className}`}>
            {config.label}
          </Badge>
        )
      },
      filterFn: (row, _id, filterValues: string[]) =>
        filterValues.includes(row.original.status),
    },
    {
      id: "activeWipQty",
      accessorFn: (row) => row.activeWipQty,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="재공수량" />
      ),
      cell: ({ row }) => (
        <div className="space-y-0.5 text-right">
          <QuantityCell value={row.original.activeWipQty} />
          {row.original.wipLocations.length > 0 ? (
            <p className="text-[12px] text-muted-foreground">
              {row.original.wipLocations[0].name}
              {row.original.wipLocations.length > 1
                ? ` 외 ${row.original.wipLocations.length - 1}곳`
                : ""}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "startedAt",
      accessorFn: (row) => new Date(row.startedAt ?? row.workOrder.createdAt).getTime(),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="시작/지시일" />
      ),
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <p className="text-[13px] font-medium text-foreground whitespace-nowrap">
            {format(new Date(row.original.startedAt ?? row.original.workOrder.createdAt), "yyyy-MM-dd")}
          </p>
          <p className="text-[13px] text-muted-foreground">
            {row.original.startedAt ? "시작일" : "지시일"}
          </p>
        </div>
      ),
    },
    {
      id: "dueDate",
      accessorFn: (row) => row.workOrder.dueDate ? new Date(row.workOrder.dueDate).getTime() : 0,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="납기일" />
      ),
      cell: ({ row }) => {
        const dueDate = row.original.workOrder.dueDate
        if (!dueDate) {
          return <span className="text-[13px] text-muted-foreground">-</span>
        }

        const delayed = isDelayed(row.original)
        return (
          <div className="flex items-center gap-2">
            <span
              className={`text-[13px] font-medium whitespace-nowrap ${
                delayed ? "text-red-600" : "text-muted-foreground"
              }`}
            >
              {format(new Date(dueDate), "yyyy-MM-dd")}
            </span>
            {delayed ? (
              <Badge variant="outline" className="border-red-200 bg-red-50 text-[12px] text-red-700 whitespace-nowrap">
                지연
              </Badge>
            ) : null}
          </div>
        )
      },
    },
  ]
}

function QuantityCell({ value }: { value: number }) {
  return (
    <span className="block text-right text-[14px] tabular-nums">
      {value.toLocaleString()}
    </span>
  )
}

function getDisplayRemainingQty(row: WipInventoryRow) {
  return Math.max(0, row.remainingQty)
}

function getProgress(row: WipInventoryRow) {
  if (row.plannedQty <= 0) return 0
  return (row.productionQty / row.plannedQty) * 100
}

function isDelayed(row: WipInventoryRow) {
  if (row.status === "COMPLETED" || row.remainingQty <= 0 || !row.workOrder.dueDate) {
    return false
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const dueDate = new Date(row.workOrder.dueDate)
  dueDate.setHours(0, 0, 0, 0)

  return dueDate < today
}
