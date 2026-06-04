"use client"

import { ColumnDef } from "@tanstack/react-table"
import { PlanStatus, PlanType } from "@prisma/client"

import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/components/common/data-table"
import { DataTableRowActions } from "@/components/common/data-table"
import { PlanWithDetails } from "@/lib/actions/production-plan.actions"

const planTypeLabels: Record<PlanType, string> = {
  DAILY: "일간",
  WEEKLY: "주간",
  MONTHLY: "월간",
}

const planStatusLabels: Record<PlanStatus, string> = {
  DRAFT: "초안",
  CONFIRMED: "확정",
  IN_PROGRESS: "진행중",
  COMPLETED: "완료",
  CANCELLED: "취소",
}

type GetColumnsProps = {
  onEdit: (plan: PlanWithDetails) => void
  onDelete: (plan: PlanWithDetails) => void
  onViewDetail: (plan: PlanWithDetails) => void
}

function formatDate(date: Date): string {
  return new Date(date).toISOString().split("T")[0]
}

export function getColumns({ onEdit, onDelete, onViewDetail }: GetColumnsProps): ColumnDef<PlanWithDetails>[] {
  return [
    {
      accessorKey: "planNo",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="계획번호" />
      ),
      cell: ({ row }) => (
        <button
          className="font-mono font-medium text-[14px] text-primary underline-offset-4 hover:underline cursor-pointer"
          onClick={() => onViewDetail(row.original)}
        >
          {row.getValue("planNo")}
        </button>
      ),
    },
    {
      accessorKey: "planType",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="계획유형" />
      ),
      cell: ({ row }) => {
        const planType = row.getValue("planType") as PlanType
        if (planType === "DAILY") {
          return (
            <Badge variant="secondary" className="text-[13px]">
              {planTypeLabels[planType]}
            </Badge>
          )
        }
        if (planType === "WEEKLY") {
          return (
            <Badge variant="outline" className="text-[13px]">
              {planTypeLabels[planType]}
            </Badge>
          )
        }
        return (
          <Badge variant="default" className="text-[13px]">
            {planTypeLabels[planType]}
          </Badge>
        )
      },
      filterFn: (row, id, filterValues: string[]) =>
        filterValues.includes(row.getValue(id)),
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
    },
    {
      id: "period",
      accessorFn: (row) => `${formatDate(row.startDate)} ~ ${formatDate(row.endDate)}`,
      header: "기간",
      cell: ({ row }) => (
        <span className="text-[14px] text-muted-foreground">
          {row.getValue("period")}
        </span>
      ),
    },
    {
      id: "salesOrderBased",
      accessorFn: (row) => row.items.some((i) => i.salesOrderItemId != null),
      header: "유형",
      cell: ({ row }) => {
        const isSalesBased = row.getValue("salesOrderBased") as boolean
        return isSalesBased ? (
          <Badge className="text-[12px] bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50">
            수주기반
          </Badge>
        ) : (
          <span className="text-[13px] text-muted-foreground/60">—</span>
        )
      },
    },
    {
      id: "earliestDueDate",
      accessorFn: (row) => {
        // 수주 연결 품목에서 유효한 납기일을 수집 (품목별 > 수주 헤더 순)
        const dates = row.items
          .map((i) => i.salesOrderItem?.deliveryDate ?? i.salesOrderItem?.salesOrder.deliveryDate ?? null)
          .filter((d): d is Date => d != null)
        if (dates.length === 0) return null
        return dates.reduce((min, d) => (d < min ? d : min))
      },
      header: "납기일",
      cell: ({ row }) => {
        const date = row.getValue("earliestDueDate") as Date | null
        if (!date) return <span className="text-[13px] text-muted-foreground/40">—</span>
        const formatted = formatDate(date)
        const isOverdue = new Date(date) < new Date(new Date().toDateString())
        return (
          <span className={`text-[13px] tabular-nums ${isOverdue ? "text-red-600 font-medium" : "text-foreground"}`}>
            {formatted}
          </span>
        )
      },
    },
    {
      id: "itemCount",
      accessorFn: (row) => row.items.length,
      header: "품목 수",
      cell: ({ row }) => (
        <span className="text-[14px] text-muted-foreground">
          {row.getValue("itemCount")}건
        </span>
      ),
    },
    {
      id: "totalPlannedQty",
      accessorFn: (row) =>
        row.items.reduce((sum, item) => sum + Number(item.plannedQty), 0),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="총 계획수량" />
      ),
      cell: ({ row }) => (
        <span className="text-[14px] text-right block">
          {(row.getValue("totalPlannedQty") as number).toLocaleString()}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="상태" />
      ),
      cell: ({ row }) => {
        const status = row.getValue("status") as PlanStatus
        if (status === "DRAFT") {
          return (
            <Badge variant="secondary" className="text-[13px]">
              {planStatusLabels[status]}
            </Badge>
          )
        }
        if (status === "CONFIRMED") {
          return (
            <Badge variant="default" className="text-[13px]">
              {planStatusLabels[status]}
            </Badge>
          )
        }
        if (status === "IN_PROGRESS") {
          return (
            <Badge className="text-[13px] bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
              {planStatusLabels[status]}
            </Badge>
          )
        }
        if (status === "COMPLETED") {
          return (
            <Badge className="text-[13px] bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
              {planStatusLabels[status]}
            </Badge>
          )
        }
        return (
          <Badge variant="destructive" className="text-[13px]">
            {planStatusLabels[status]}
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
        const canDelete = status === "DRAFT"
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
