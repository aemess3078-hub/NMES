"use client"

import { ColumnDef } from "@tanstack/react-table"
import { OperationStatus } from "@prisma/client"

import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/components/common/data-table"
import { ProductionResultWithDetails } from "@/lib/actions/production-result.actions"

const operationStatusLabels: Record<OperationStatus, string> = {
  PENDING: "대기",
  IN_PROGRESS: "진행중",
  COMPLETED: "완료",
  SKIPPED: "건너뜀",
}

function formatDateTime(date: Date | null): string {
  if (!date) return "-"
  const d = new Date(date)
  const dateStr = d.toISOString().split("T")[0]
  const timeStr = d.toTimeString().slice(0, 5)
  return `${dateStr} ${timeStr}`
}

export function getColumns(): ColumnDef<ProductionResultWithDetails>[] {
  return [
    {
      id: "orderNo",
      accessorFn: (row) => row.workOrderOperation.workOrder.orderNo,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="작업지시번호" />
      ),
      cell: ({ row }) => (
        <span className="font-mono font-medium text-[14px]">
          {row.getValue("orderNo")}
        </span>
      ),
    },
    {
      id: "item",
      accessorFn: (row) =>
        `${row.workOrderOperation.workOrder.item.code} ${row.workOrderOperation.workOrder.item.name}`,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="품목" />
      ),
      cell: ({ row }) => {
        const item = row.original.workOrderOperation.workOrder.item
        return (
          <div className="flex flex-col">
            <span className="text-[14px] font-medium">{item.name}</span>
            <span className="text-[13px] text-muted-foreground">{item.code}</span>
          </div>
        )
      },
    },
    {
      id: "operation",
      accessorFn: (row) => row.workOrderOperation.routingOperation.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="공정" />
      ),
      cell: ({ row }) => (
        <span className="text-[14px]">
          {row.original.workOrderOperation.routingOperation.name}
        </span>
      ),
    },
    {
      id: "workCenter",
      accessorFn: (row) =>
        row.workOrderOperation.routingOperation.workCenter.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="작업장" />
      ),
      cell: ({ row }) => (
        <span className="text-[14px]">
          {row.original.workOrderOperation.routingOperation.workCenter.name}
        </span>
      ),
    },
    {
      id: "goodQty",
      accessorFn: (row) => row.goodQty,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="양품수량" />
      ),
      cell: ({ row }) => {
        const qty = row.getValue("goodQty") as number
        return (
          <span className="text-[14px] font-semibold text-green-700 block text-right">
            {qty.toLocaleString()}
          </span>
        )
      },
    },
    {
      id: "defectQty",
      accessorFn: (row) => row.defectQty,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="불량수량" />
      ),
      cell: ({ row }) => {
        const qty = row.getValue("defectQty") as number
        return (
          <span
            className={`text-[14px] font-semibold block text-right ${
              qty > 0 ? "text-red-600" : "text-muted-foreground"
            }`}
          >
            {qty.toLocaleString()}
          </span>
        )
      },
    },
    {
      id: "reworkQty",
      accessorFn: (row) => row.reworkQty,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="재작업수량" />
      ),
      cell: ({ row }) => {
        const qty = row.getValue("reworkQty") as number
        return (
          <span
            className={`text-[14px] font-semibold block text-right ${
              qty > 0 ? "text-amber-600" : "text-muted-foreground"
            }`}
          >
            {qty.toLocaleString()}
          </span>
        )
      },
    },
    {
      id: "startedAt",
      accessorFn: (row) => row.startedAt,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="작업시작" />
      ),
      cell: ({ row }) => (
        <span className="text-[14px] text-muted-foreground whitespace-nowrap">
          {formatDateTime(row.original.startedAt)}
        </span>
      ),
    },
    {
      id: "endedAt",
      accessorFn: (row) => row.endedAt,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="작업종료" />
      ),
      cell: ({ row }) => (
        <span className="text-[14px] text-muted-foreground whitespace-nowrap">
          {formatDateTime(row.original.endedAt)}
        </span>
      ),
    },
    {
      id: "operationStatus",
      accessorFn: (row) => row.workOrderOperation.status,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="공정상태" />
      ),
      cell: ({ row }) => {
        const status = row.original.workOrderOperation.status as OperationStatus
        const label = operationStatusLabels[status] ?? status

        if (status === "PENDING") {
          return (
            <Badge variant="secondary" className="text-[13px]">
              {label}
            </Badge>
          )
        }
        if (status === "IN_PROGRESS") {
          return (
            <Badge className="text-[13px] bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
              {label}
            </Badge>
          )
        }
        if (status === "COMPLETED") {
          return (
            <Badge className="text-[13px] bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
              {label}
            </Badge>
          )
        }
        // SKIPPED
        return (
          <Badge variant="outline" className="text-[13px]">
            {label}
          </Badge>
        )
      },
      filterFn: (row, id, filterValues: string[]) =>
        filterValues.includes(row.original.workOrderOperation.status),
    },
  ]
}
