"use client"

import { ColumnDef } from "@tanstack/react-table"
import { ShipmentStatus } from "@prisma/client"
import { MoreHorizontal, CheckCircle, Trash2 } from "lucide-react"
import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"

export type ShipmentRow = {
  id: string
  shipmentNo: string
  salesOrderId: string
  salesOrder: {
    orderNo: string
    customer: { name: string }
  }
  status: ShipmentStatus
  plannedDate: Date | string
  shippedDate?: Date | string | null
  deliveredDate?: Date | string | null
  items: { qty: number | string }[]
}

const STATUS_CONFIG: Record<
  ShipmentStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  PLANNED:   { label: "출하예정", variant: "secondary" },
  PICKED:    { label: "피킹완료", variant: "outline" },
  SHIPPED:   { label: "출하완료", variant: "default" },
  DELIVERED: { label: "배송완료", variant: "default" },
  CANCELLED: { label: "취소",     variant: "destructive" },
}

export function getColumns(
  onConfirm: (id: string) => void,
  onDelete: (id: string) => void
): ColumnDef<ShipmentRow>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          aria-label="전체 선택"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          aria-label="행 선택"
        />
      ),
      size: 40,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "shipmentNo",
      header: "출하번호",
      cell: ({ row }) => (
        <span className="font-mono text-[13px] font-medium">{row.original.shipmentNo}</span>
      ),
    },
    {
      id: "orderNo",
      header: "수주번호",
      accessorFn: (row) => row.salesOrder.orderNo,
      cell: ({ row }) => (
        <span className="font-mono text-[13px] text-muted-foreground">
          {row.original.salesOrder.orderNo}
        </span>
      ),
    },
    {
      id: "customer",
      header: "고객사",
      accessorFn: (row) => row.salesOrder.customer.name,
      cell: ({ row }) => (
        <span className="text-[14px]">{row.original.salesOrder.customer.name}</span>
      ),
    },
    {
      accessorKey: "plannedDate",
      header: "출하예정일",
      cell: ({ row }) => (
        <span className="text-[13px] text-muted-foreground">
          {format(new Date(row.original.plannedDate), "yyyy-MM-dd")}
        </span>
      ),
    },
    {
      accessorKey: "shippedDate",
      header: "출하일",
      cell: ({ row }) => {
        const d = row.original.shippedDate
        if (!d) return <span className="text-[13px] text-muted-foreground">—</span>
        return (
          <span className="text-[13px] font-medium">
            {format(new Date(d), "yyyy-MM-dd")}
          </span>
        )
      },
    },
    {
      id: "itemCount",
      header: "품목 수",
      cell: ({ row }) => (
        <span className="text-[13px]">{row.original.items.length}개</span>
      ),
    },
    {
      id: "totalQty",
      header: "총수량",
      cell: ({ row }) => {
        const total = row.original.items.reduce((s, i) => s + Number(i.qty), 0)
        return <span className="text-[13px]">{total.toLocaleString()}</span>
      },
    },
    {
      accessorKey: "status",
      header: "상태",
      cell: ({ row }) => {
        const cfg = STATUS_CONFIG[row.original.status]
        return (
          <Badge variant={cfg.variant} className="text-[12px]">
            {cfg.label}
          </Badge>
        )
      },
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => onConfirm(row.original.id)}
              disabled={row.original.status !== "PLANNED"}
            >
              <CheckCircle className="mr-2 h-4 w-4" /> 출하 확정
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(row.original.id)}
              disabled={row.original.status !== "PLANNED"}
            >
              <Trash2 className="mr-2 h-4 w-4" /> 삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]
}
