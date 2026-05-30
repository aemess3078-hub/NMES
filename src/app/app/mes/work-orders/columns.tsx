"use client"

import Link from "next/link"
import { type ColumnDef } from "@tanstack/react-table"
import { type OperationStatus, type WorkOrderStatus } from "@prisma/client"
import { Boxes, ChevronDown, ChevronRight, ExternalLink, Layers, Package, Send, Wrench, type LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DataTableColumnHeader } from "@/components/common/data-table"
import { DataTableRowActions } from "@/components/common/data-table"
import { type WorkOrderWithDetails } from "@/lib/actions/work-order.actions"

const itemTypeBadge: Record<string, { label: string; className: string; Icon: LucideIcon }> = {
  FINISHED: { label: "완제품", className: "border-blue-200 bg-blue-50 text-blue-700", Icon: Package },
  SEMI_FINISHED: { label: "반제품", className: "border-purple-200 bg-purple-50 text-purple-700", Icon: Layers },
  RAW_MATERIAL: { label: "원자재", className: "border-slate-200 bg-slate-50 text-slate-600", Icon: Boxes },
  CONSUMABLE: { label: "소모품", className: "border-amber-200 bg-amber-50 text-amber-700", Icon: Wrench },
}

const workOrderStatusLabels: Record<WorkOrderStatus, string> = {
  DRAFT: "초안",
  RELEASED: "작업대기",
  IN_PROGRESS: "진행중",
  COMPLETED: "완료",
  CANCELLED: "취소",
}

const operationStatusPriority: Record<OperationStatus, number> = {
  IN_PROGRESS: 0,
  PENDING: 1,
  COMPLETED: 2,
  SKIPPED: 3,
}

type GetColumnsProps = {
  onEdit: (workOrder: WorkOrderWithDetails) => void
  onDelete: (workOrder: WorkOrderWithDetails) => void
  onRelease: (workOrder: WorkOrderWithDetails) => void
}

function displayProcessName(processName: string): string {
  return processName.includes("후처리") ? "후처리공정" : processName
}

function getCurrentOperation(workOrder: WorkOrderWithDetails) {
  if (workOrder.operations.length === 0) return null

  return [...workOrder.operations].sort((a, b) => {
    const priorityDiff = operationStatusPriority[a.status] - operationStatusPriority[b.status]
    return priorityDiff !== 0 ? priorityDiff : a.seq - b.seq
  })[0]
}

function getCompletedQty(workOrder: WorkOrderWithDetails): number {
  if (workOrder.operations.length === 0) return 0

  const finalOperation = [...workOrder.operations].sort((a, b) => b.seq - a.seq)[0]
  return Number(finalOperation?.completedQty ?? 0)
}

function getMaterialIssueStatus(workOrder: WorkOrderWithDetails): {
  label: string
  className: string
  detail: string
} {
  const issueCount = workOrder.materialLots.length
  if (issueCount > 0) {
    const totalQty = workOrder.materialLots.reduce((sum, lot) => sum + Number(lot.qty), 0)
    return {
      label: "투입됨",
      className: "border-green-200 bg-green-50 text-green-700",
      detail: `${issueCount}개 LOT / ${totalQty.toLocaleString()}`,
    }
  }

  return {
    label: "미투입",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    detail: "원자재 LOT 이력 없음",
  }
}

export function getColumns({ onEdit, onDelete, onRelease }: GetColumnsProps): ColumnDef<WorkOrderWithDetails>[] {
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
      id: "expand",
      header: "",
      cell: ({ row }) => (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={row.getIsExpanded() ? "상세 닫기" : "상세 열기"}
          onClick={(event) => {
            event.stopPropagation()
            row.toggleExpanded()
          }}
        >
          {row.getIsExpanded() ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
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
        <div>
          <span className="font-mono text-[14px] font-semibold">
            {row.original.orderNo}
          </span>
          <div className="mt-0.5 text-[13px] text-muted-foreground">
            {row.original.site.name}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "manufacturingNo",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="제조번호" />
      ),
      cell: ({ row }) => {
        const value = row.original.manufacturingNo
        if (!value) {
          return <span className="text-[14px] text-muted-foreground">-</span>
        }
        return (
          <span className="font-mono text-[13px] text-blue-700">{value}</span>
        )
      },
    },
    {
      id: "itemName",
      accessorFn: (row) => row.item.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="품목명" />
      ),
      cell: ({ row }) => {
        const badge = itemTypeBadge[row.original.item.itemType]
        return (
          <div className="text-[14px]">
            <div className="flex items-center gap-1.5">
              <span className="font-medium">{row.original.item.name}</span>
              {badge && (
                <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] font-medium ${badge.className}`}>
                  <badge.Icon className="h-2.5 w-2.5" />
                  {badge.label}
                </span>
              )}
            </div>
            <div className="font-mono text-[13px] text-muted-foreground">{row.original.item.code}</div>
          </div>
        )
      },
    },
    {
      id: "plannedQty",
      accessorFn: (row) => Number(row.plannedQty),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="계획수량" />
      ),
      cell: ({ row }) => (
        <span className="block text-right text-[14px] tabular-nums">
          {(row.getValue("plannedQty") as number).toLocaleString()}
        </span>
      ),
    },
    {
      id: "completedQty",
      accessorFn: (row) => getCompletedQty(row),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="완료수량" />
      ),
      cell: ({ row }) => (
        <span className="block text-right text-[14px] font-medium tabular-nums">
          {(row.getValue("completedQty") as number).toLocaleString()}
        </span>
      ),
    },
    {
      id: "currentOperation",
      accessorFn: (row) => {
        const operation = getCurrentOperation(row)
        return operation ? displayProcessName(operation.routingOperation.name) : ""
      },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="현재 공정" />
      ),
      cell: ({ row }) => {
        const operation = getCurrentOperation(row.original)
        if (!operation) {
          return <span className="text-[13px] text-muted-foreground">공정 미생성</span>
        }

        return (
          <div className="text-[13px]">
            <div className="font-medium">{operation.seq}. {displayProcessName(operation.routingOperation.name)}</div>
            <div className="text-muted-foreground">{operation.status}</div>
          </div>
        )
      },
    },
    {
      id: "materialIssueStatus",
      accessorFn: (row) => row.materialLots.length,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="원자재 투입상태" />
      ),
      cell: ({ row }) => {
        const status = getMaterialIssueStatus(row.original)
        return (
          <div>
            <Badge variant="outline" className={`text-[13px] ${status.className}`}>
              {status.label}
            </Badge>
            <div className="mt-1 text-[12px] text-muted-foreground">{status.detail}</div>
          </div>
        )
      },
    },
    {
      id: "createdAt",
      accessorFn: (row) => row.createdAt,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="지시일자" />
      ),
      cell: ({ row }) => {
        const val = row.original.createdAt
        if (!val) return <span className="text-[14px] text-muted-foreground">-</span>
        const d = new Date(val)
        const formatted = `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`
        return <span className="text-[13px] font-mono text-muted-foreground">{formatted}</span>
      },
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
          <span className={`text-[14px] ${isPast ? "font-medium text-red-600" : ""}`}>
            {formatted}
          </span>
        )
      },
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
            <Badge className="border-amber-200 bg-amber-100 text-[13px] text-amber-800 hover:bg-amber-100">
              {workOrderStatusLabels[status]}
            </Badge>
          )
        }
        if (status === "COMPLETED") {
          return (
            <Badge className="border-green-200 bg-green-100 text-[13px] text-green-800 hover:bg-green-100">
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
      id: "traceability",
      header: "추적성",
      cell: ({ row }) => {
        const manufacturingNo = row.original.manufacturingNo
        if (!manufacturingNo) {
          return <span className="text-[13px] text-muted-foreground">-</span>
        }

        return (
          <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-[13px]">
            <Link href={`/app/mes/manufacturing-traceability?manufacturingNo=${encodeURIComponent(manufacturingNo)}`}>
              조회
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const status = row.original.status
        const canDelete = status === "DRAFT" || status === "RELEASED"
        const isDraft = status === "DRAFT"
        return (
          <div className="flex items-center gap-1">
            {isDraft && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50 text-[13px]"
                onClick={(e) => { e.stopPropagation(); onRelease(row.original) }}
              >
                <Send className="h-3.5 w-3.5" />
                작업지시 내리기
              </Button>
            )}
            <DataTableRowActions
              onEdit={() => onEdit(row.original)}
              onDelete={canDelete ? () => onDelete(row.original) : undefined}
            />
          </div>
        )
      },
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
