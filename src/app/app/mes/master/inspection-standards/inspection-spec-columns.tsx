"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Pencil, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { InspectionSpecWithItems } from "@/lib/actions/quality.actions"

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export type InspectionSpecRow = InspectionSpecWithItems & {
  itemLabel: string
  operationLabel: string
}

// ─── 상태 배지 설정 ───────────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DRAFT:    { label: "초안",   className: "bg-slate-100 text-slate-600" },
  ACTIVE:   { label: "활성",   className: "bg-green-100 text-green-800" },
  INACTIVE: { label: "비활성", className: "bg-red-100 text-red-700" },
}

// ─── 컬럼 정의 ───────────────────────────────────────────────────────────────

type ColumnActions = {
  onEdit: (row: InspectionSpecRow) => void
  onDelete: (row: InspectionSpecRow) => void
}

export function getInspectionSpecColumns({
  onEdit,
  onDelete,
}: ColumnActions): ColumnDef<InspectionSpecRow>[] {
  return [
    {
      accessorKey: "itemLabel",
      header: "품목",
      cell: ({ row }) => (
        <span className="text-[14px]">{row.original.itemLabel}</span>
      ),
    },
    {
      accessorKey: "operationLabel",
      header: "공정",
      cell: ({ row }) => (
        <span className="text-[14px]">{row.original.operationLabel}</span>
      ),
    },
    {
      accessorKey: "version",
      header: "버전",
      cell: ({ row }) => (
        <span className="font-mono text-[13px]">{row.original.version}</span>
      ),
    },
    {
      id: "itemCount",
      header: "검사항목 수",
      cell: ({ row }) => (
        <span className="text-[14px]">
          {row.original.inspectionItems.length}개
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "상태",
      cell: ({ row }) => {
        const cfg = STATUS_CONFIG[row.original.status] ?? STATUS_CONFIG.DRAFT
        return (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-medium ${cfg.className}`}
          >
            {cfg.label}
          </span>
        )
      },
      filterFn: (row, _, filterValue: string[]) => {
        if (!filterValue?.length) return true
        return filterValue.includes(row.original.status)
      },
    },
    {
      accessorKey: "updatedAt",
      header: "최근수정일",
      cell: ({ row }) => {
        const date = new Date(row.original.updatedAt)
        return (
          <span className="text-[13px] text-muted-foreground">
            {date.toLocaleDateString("ko-KR")}
          </span>
        )
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const spec = row.original
        return (
          <div className="flex items-center justify-end gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit(spec)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => onDelete(spec)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )
      },
    },
  ]
}
