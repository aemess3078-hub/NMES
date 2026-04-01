"use client"

import { ColumnDef } from "@tanstack/react-table"
import { CheckCircle2, AlertCircle, Clock, PackagePlus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTableColumnHeader } from "@/components/common/data-table"
import { WorkOrderForReceipt } from "@/lib/actions/finished-goods.actions"

const INSPECTION_CONFIG = {
  PASS: { label: "합격", className: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle2 },
  FAIL: { label: "불합격", className: "bg-red-100 text-red-800 border-red-200", icon: AlertCircle },
  CONDITIONAL: { label: "조건부", className: "bg-amber-100 text-amber-800 border-amber-200", icon: AlertCircle },
} as const

type GetColumnsProps = {
  onReceipt: (wo: WorkOrderForReceipt) => void
}

export function getColumns({ onReceipt }: GetColumnsProps): ColumnDef<WorkOrderForReceipt>[] {
  return [
    {
      id: "orderNo",
      accessorFn: (row) => row.orderNo,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="작업지시번호" />
      ),
      cell: ({ row }) => (
        <span className="font-mono font-medium text-[14px]">{row.original.orderNo}</span>
      ),
    },
    {
      id: "itemName",
      accessorFn: (row) => row.item.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="품목명" />
      ),
      cell: ({ row }) => (
        <div>
          <div className="text-[14px] font-medium">{row.original.item.name}</div>
          <div className="text-[13px] text-muted-foreground font-mono">
            {row.original.item.code}
          </div>
        </div>
      ),
    },
    {
      id: "plannedQty",
      header: "계획/양품",
      cell: ({ row }) => {
        const { plannedQty, totalGoodQty, item } = row.original
        return (
          <div className="text-[14px]">
            <span className="text-muted-foreground">{plannedQty.toLocaleString()}</span>
            <span className="text-muted-foreground mx-1">/</span>
            <span className="font-medium">{totalGoodQty.toLocaleString()}</span>
            <span className="text-[13px] text-muted-foreground ml-1">{item.uom}</span>
          </div>
        )
      },
    },
    {
      id: "receiptQty",
      header: "입고현황",
      cell: ({ row }) => {
        const { totalReceiptQty, totalGoodQty, pendingQty, item } = row.original
        if (pendingQty === 0 && totalReceiptQty > 0) {
          return (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              <span className="text-[14px] text-green-700 font-medium">
                {totalReceiptQty.toLocaleString()} {item.uom} 입고 완료
              </span>
            </div>
          )
        }
        if (totalReceiptQty > 0) {
          return (
            <div className="text-[14px]">
              <span className="text-muted-foreground">{totalReceiptQty.toLocaleString()}</span>
              <span className="text-muted-foreground mx-1">/</span>
              <span className="font-medium text-amber-700">{pendingQty.toLocaleString()} 대기</span>
              <span className="text-[13px] text-muted-foreground ml-1">{item.uom}</span>
            </div>
          )
        }
        return (
          <span className="text-[14px] text-muted-foreground">
            {totalGoodQty > 0 ? `${totalGoodQty.toLocaleString()} ${item.uom} 대기` : "-"}
          </span>
        )
      },
    },
    {
      id: "inspectionResult",
      header: "검사결과",
      cell: ({ row }) => {
        const result = row.original.latestInspectionResult
        if (!result) {
          return (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[13px] text-muted-foreground">검사 없음</span>
            </div>
          )
        }
        const cfg = INSPECTION_CONFIG[result]
        const Icon = cfg.icon
        return (
          <Badge variant="outline" className={`text-[13px] gap-1 ${cfg.className}`}>
            <Icon className="h-3 w-3" />
            {cfg.label}
          </Badge>
        )
      },
    },
    {
      id: "dueDate",
      header: "납기일",
      cell: ({ row }) => {
        const d = row.original.dueDate
        if (!d) return <span className="text-[14px] text-muted-foreground">-</span>
        const date = new Date(d)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return (
          <span
            className={`text-[14px] ${date < today ? "text-red-600 font-medium" : "text-muted-foreground"}`}
          >
            {date.toISOString().split("T")[0]}
          </span>
        )
      },
    },
    {
      id: "actions",
      header: "작업",
      cell: ({ row }) => {
        const wo = row.original
        if (wo.pendingQty <= 0) return null
        return (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[13px] px-2 gap-1 border-green-200 text-green-700 hover:bg-green-50"
            onClick={() => onReceipt(wo)}
          >
            <PackagePlus className="h-3.5 w-3.5" />
            입고처리
          </Button>
        )
      },
      enableSorting: false,
    },
  ]
}
