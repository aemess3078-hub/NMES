"use client"

import { ColumnDef } from "@tanstack/react-table"
import { ItemType, ItemStatus } from "@prisma/client"

import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { DataTableColumnHeader } from "@/components/common/data-table"
import { DataTableRowActions } from "@/components/common/data-table"
import { ItemWithCategory } from "@/lib/actions/item.actions"

const itemTypeLabels: Record<ItemType, string> = {
  RAW_MATERIAL: "원자재",
  SEMI_FINISHED: "반제품",
  FINISHED: "완제품",
  CONSUMABLE: "소모품",
}

const itemStatusLabels: Record<ItemStatus, string> = {
  ACTIVE: "활성",
  INACTIVE: "비활성",
  DISCONTINUED: "단종",
}

export const columns: ColumnDef<ItemWithCategory>[] = [
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
    accessorKey: "code",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="품목코드" />
    ),
    cell: ({ row }) => (
      <span className="font-medium text-[14px]">{row.getValue("code")}</span>
    ),
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="품목명" />
    ),
    cell: ({ row }) => (
      <span className="text-[14px]">{row.getValue("name")}</span>
    ),
  },
  {
    accessorKey: "itemType",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="유형" />
    ),
    cell: ({ row }) => {
      const type = row.getValue("itemType") as ItemType
      return (
        <Badge
          variant={type === "FINISHED" ? "default" : "secondary"}
          className="text-[13px]"
        >
          {itemTypeLabels[type]}
        </Badge>
      )
    },
    filterFn: (row, id, filterValues: string[]) =>
      filterValues.includes(row.getValue(id)),
  },
  {
    id: "category",
    accessorFn: (row) => row.category?.name ?? "-",
    header: "카테고리",
    cell: ({ row }) => (
      <span className="text-[14px] text-muted-foreground">
        {row.getValue("category") as string}
      </span>
    ),
  },
  {
    accessorKey: "uom",
    header: "단위",
    cell: ({ row }) => (
      <span className="text-[14px]">{row.getValue("uom")}</span>
    ),
  },
  {
    accessorKey: "isLotTracked",
    header: "LOT",
    cell: ({ row }) => {
      const isTracked = row.getValue("isLotTracked") as boolean
      return (
        <Badge
          variant={isTracked ? "default" : "secondary"}
          className="text-[13px]"
        >
          {isTracked ? "O" : "X"}
        </Badge>
      )
    },
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="상태" />
    ),
    cell: ({ row }) => {
      const status = row.getValue("status") as ItemStatus
      const variantMap: Record<ItemStatus, "default" | "secondary" | "destructive"> = {
        ACTIVE: "default",
        INACTIVE: "secondary",
        DISCONTINUED: "destructive",
      }
      return (
        <Badge variant={variantMap[status]} className="text-[13px]">
          {itemStatusLabels[status]}
        </Badge>
      )
    },
    filterFn: (row, id, filterValues: string[]) =>
      filterValues.includes(row.getValue(id)),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <DataTableRowActions
        onView={() => console.log("view", row.original)}
        onEdit={() => console.log("edit", row.original)}
        onDelete={() => console.log("delete", row.original)}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
]
