"use client"

import { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DataTableColumnHeader } from "@/components/common/data-table"
import type { EquipmentWithDetails } from "@/lib/actions/equipment.actions"

// ─── 레이블 맵 ────────────────────────────────────────────────────────────────

export const EQUIPMENT_TYPE_LABELS: Record<string, string> = {
  MACHINE:  "기계",
  TOOL:     "공구",
  JIG:      "지그",
  FIXTURE:  "고정구",
  VEHICLE:  "이송장비",
}

export const EQUIPMENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE:      "가동",
  INACTIVE:    "미사용",
  MAINTENANCE: "유지보수",
}

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  ACTIVE:      "default",
  INACTIVE:    "secondary",
  MAINTENANCE: "outline",
}

// ─── 컬럼 정의 ────────────────────────────────────────────────────────────────

type ColCallbacks = {
  onEdit:   (eq: EquipmentWithDetails) => void
  onDelete: (eq: EquipmentWithDetails) => void
}

export function getColumns({ onEdit, onDelete }: ColCallbacks): ColumnDef<EquipmentWithDetails>[] {
  return [
    {
      id: "code",
      accessorKey: "code",
      header: ({ column }) => <DataTableColumnHeader column={column} title="설비코드" />,
      cell: ({ row }) => (
        <span className="font-mono text-[14px] font-medium">{row.original.code}</span>
      ),
    },
    {
      id: "name",
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="설비명" />,
      cell: ({ row }) => (
        <span className="text-[14px]">{row.original.name}</span>
      ),
    },
    {
      id: "equipmentType",
      accessorKey: "equipmentType",
      header: ({ column }) => <DataTableColumnHeader column={column} title="설비유형" />,
      cell: ({ row }) => (
        <span className="text-[13px] text-muted-foreground">
          {EQUIPMENT_TYPE_LABELS[row.original.equipmentType] ?? row.original.equipmentType}
        </span>
      ),
      filterFn: (row, _id, filterValues: string[]) =>
        filterValues.includes(row.original.equipmentType),
    },
    {
      id: "siteName",
      accessorFn: (row) => row.site.name,
      header: ({ column }) => <DataTableColumnHeader column={column} title="사이트" />,
      cell: ({ row }) => (
        <span className="text-[14px]">{row.original.site.name}</span>
      ),
    },
    {
      id: "workCenterName",
      accessorFn: (row) => row.workCenter.name,
      header: ({ column }) => <DataTableColumnHeader column={column} title="작업장" />,
      cell: ({ row }) => (
        <span className="text-[14px] text-muted-foreground">{row.original.workCenter.name}</span>
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="상태" />,
      cell: ({ row }) => {
        const s = row.original.status
        return (
          <Badge
            variant={statusVariant[s] ?? "secondary"}
            className={
              s === "ACTIVE"
                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                : s === "MAINTENANCE"
                ? "bg-amber-100 text-amber-800 border-amber-200"
                : ""
            }
          >
            {EQUIPMENT_STATUS_LABELS[s] ?? s}
          </Badge>
        )
      },
      filterFn: (row, _id, filterValues: string[]) =>
        filterValues.includes(row.original.status),
    },
    {
      id: "connections",
      accessorFn: (row) => row._count.connections,
      header: "태그연결",
      cell: ({ row }) => {
        const cnt = row.original._count.connections
        return (
          <span className={`text-[13px] tabular-nums ${cnt > 0 ? "text-blue-600 font-medium" : "text-muted-foreground"}`}>
            {cnt > 0 ? `${cnt}개` : "—"}
          </span>
        )
      },
    },
    {
      id: "createdAt",
      accessorKey: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="등록일" />,
      cell: ({ row }) => (
        <span className="text-[13px] text-muted-foreground">
          {new Date(row.original.createdAt).toLocaleDateString("ko-KR")}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(row.original)} className="text-[14px]">
              <Pencil className="h-4 w-4 mr-2" />
              수정
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(row.original)}
              className="text-[14px] text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
