"use client"

import { ColumnDef } from "@tanstack/react-table"
import { WorkOrderStatus } from "@prisma/client"

import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { DataTableColumnHeader } from "@/components/common/data-table"
import { DataTableRowActions } from "@/components/common/data-table"
import { WorkOrderWithDetails } from "@/lib/actions/work-order.actions"

const workOrderStatusLabels: Record<WorkOrderStatus, string> = {
  DRAFT: "초안",
  RELEASED: "릴리즈",
  IN_PROGRESS: "진행중",
  COMPLETED: "완료",
  CANCELLED: "취소",
}

type GetColumnsProps = {
  onEdit: (workOrder: WorkOrderWithDetails) => void
  onDelete: (workOrder: WorkOrderWithDetails) => void
}

export function getColumns({ onEdit, onDelete }: GetColumnsProps): ColumnDef<WorkOrderWithDetails>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="전체 선택"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="행 선택"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "orderNo",
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
      id: "itemCode",
      accessorFn: (row) => row.item.code,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="품목코드" />
      ),
      cell: ({ row }) => (
        <span className="font-medium text-[14px]">{row.getValue("itemCode")}</span>
      ),
    },
    {
      id: "itemName",
      accessorFn: (row) => row.item.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="품목명" />
      ),
      cell: ({ row }) => (
        <span className="text-[14px]">{row.getValue("itemName")}</span>
      ),
    },
    {
      id: "plannedQty",
      accessorFn: (row) => Number(row.plannedQty),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="계획수량" />
      ),
      cell: ({ row }) => (
        <span className="text-[14px] text-right block">
          {(row.getValue("plannedQty") as number).toLocaleString()}
        </span>
      ),
    },
    {
      id: "siteName",
      accessorFn: (row) => row.site.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="공장" />
      ),
      cell: ({ row }) => (
        <span className="text-[14px]">{row.getValue("siteName")}</span>
      ),
      filterFn: (row, id, filterValues: string[]) =>
        filterValues.includes(row.original.siteId),
    },
    {
      id: "dueDate",
      accessorFn: (row) => row.dueDate,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="납기일" />
      ),
      cell: ({ row }) => {
        const dueDate = row.original.dueDate
        if (!dueDate) {
          return <span className="text-[14px] text-muted-foreground">-</span>
        }
        const date = new Date(dueDate)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const isPast = date < today
        const formatted = date.toISOString().split("T")[0]
        return (
          <span className={`text-[14px] ${isPast ? "text-red-600 font-medium" : ""}`}>
            {formatted}
          </span>
        )
      },
    },
    {
      id: "operationCount",
      accessorFn: (row) => row.operations.length,
      header: "공정 수",
      cell: ({ row }) => (
        <span className="text-[14px] text-muted-foreground">
          {row.getValue("operationCount")}건
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="상태" />
      ),
      cell: ({ row }) => {
        const status = row.getValue("status") as WorkOrderStatus
        if (status === "DRAFT") {
          return (
            <Badge variant="secondary" className="text-[13px]">
              {workOrderStatusLabels[status]}
            </Badge>
          )
        }
        if (status === "RELEASED") {
          return (
            <Badge variant="outline" className="text-[13px]">
              {workOrderStatusLabels[status]}
            </Badge>
          )
        }
        if (status === "IN_PROGRESS") {
          return (
            <Badge className="text-[13px] bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
              {workOrderStatusLabels[status]}
            </Badge>
          )
        }
        if (status === "COMPLETED") {
          return (
            <Badge className="text-[13px] bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
              {workOrderStatusLabels[status]}
            </Badge>
          )
        }
        return (
          <Badge variant="destructive" className="text-[13px]">
            {workOrderStatusLabels[status]}
          </Badge>
        )
      },
      filterFn: (row, id, filterValues: string[]) =>
        filterValues.includes(row.getValue(id)),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const status = row.original.status
        const canDelete = status === "DRAFT" || status === "RELEASED"
        return (
          <DataTableRowActions
            onEdit={() => onEdit(row.original)}
            onDelete={canDelete ? () => onDelete(row.original) : undefined}
          />
        )
      },
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
