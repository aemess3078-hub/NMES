"use client"

import { ColumnDef } from "@tanstack/react-table"
import { RoutingStatus } from "@prisma/client"

import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { DataTableColumnHeader } from "@/components/common/data-table"
import { DataTableRowActions } from "@/components/common/data-table"
import { RoutingWithDetails } from "@/lib/actions/routing.actions"

const routingStatusLabels: Record<RoutingStatus, string> = {
  DRAFT: "초안",
  ACTIVE: "활성",
  INACTIVE: "비활성",
}

const itemTypeLabels: Record<string, string> = {
  RAW_MATERIAL: "원자재",
  SEMI_FINISHED: "반제품",
  FINISHED: "완제품",
  CONSUMABLE: "소모품",
}

export function getColumns(callbacks: {
  onEdit: (routing: RoutingWithDetails) => void
  onDelete: (routing: RoutingWithDetails) => void
}): ColumnDef<RoutingWithDetails>[] {
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
      accessorKey: "code",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="라우팅 코드" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-[14px] font-medium">{row.getValue("code")}</span>
      ),
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="라우팅 명" />
      ),
      cell: ({ row }) => (
        <span className="text-[14px]">{row.getValue("name")}</span>
      ),
    },
    {
      id: "itemCode",
      accessorFn: (row) => row.items?.[0]?.item?.code ?? "-",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="품목코드" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-[14px]">{row.getValue("itemCode")}</span>
      ),
    },
    {
      id: "itemName",
      accessorFn: (row) => row.items?.[0]?.item?.name ?? "-",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="품목명" />
      ),
      cell: ({ row }) => (
        <span className="text-[14px]">{row.getValue("itemName")}</span>
      ),
    },
    {
      accessorKey: "version",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="버전" />
      ),
      cell: ({ row }) => (
        <span className="text-[14px] font-mono">{row.getValue("version")}</span>
      ),
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
      id: "itemType",
      accessorFn: (row) => row.items?.[0]?.item?.itemType ?? "",
      header: "품목유형",
      cell: ({ row }) => {
        const type = row.getValue("itemType") as string
        if (!type) return <span className="text-[13px] text-muted-foreground">-</span>
        return (
          <Badge variant="secondary" className="text-[13px]">
            {itemTypeLabels[type] ?? type}
          </Badge>
        )
      },
      filterFn: (row, id, filterValues: string[]) =>
        filterValues.includes(row.getValue(id)),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="상태" />
      ),
      cell: ({ row }) => {
        const status = row.getValue("status") as RoutingStatus
        const variantMap: Record<RoutingStatus, "default" | "secondary" | "destructive"> = {
          DRAFT: "secondary",
          ACTIVE: "default",
          INACTIVE: "destructive",
        }
        return (
          <Badge variant={variantMap[status] ?? "secondary"} className="text-[13px]">
            {routingStatusLabels[status] ?? status}
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
          onEdit={() => callbacks.onEdit(row.original)}
          onDelete={() => callbacks.onDelete(row.original)}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
