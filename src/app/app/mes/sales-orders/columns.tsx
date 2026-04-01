"use client"

import { ColumnDef } from "@tanstack/react-table"
import { SalesOrderStatus } from "@prisma/client"
import { MoreHorizontal, Pencil, Trash2, ArrowRight } from "lucide-react"
import { format, isPast, isWithinInterval, addDays } from "date-fns"
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

export type SalesOrderRow = {
  id: string
  orderNo: string
  customer: { id: string; name: string }
  orderDate: Date | string
  deliveryDate: Date | string
  status: SalesOrderStatus
  items: { qty: number | string; unitPrice?: number | null }[]
  totalAmount?: number | null
  currency: string
}

const STATUS_CONFIG: Record<
  SalesOrderStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  DRAFT:           { label: "초안",     variant: "secondary" },
  CONFIRMED:       { label: "확정",     variant: "default" },
  IN_PRODUCTION:   { label: "생산중",   variant: "default" },
  PARTIAL_SHIPPED: { label: "부분출하", variant: "outline" },
  SHIPPED:         { label: "출하완료", variant: "default" },
  CLOSED:          { label: "완료",     variant: "secondary" },
  CANCELLED:       { label: "취소",     variant: "destructive" },
}

export function getColumns(
  onEdit: (row: SalesOrderRow) => void,
  onDelete: (id: string) => void,
  onProcess?: (row: SalesOrderRow) => void
): ColumnDef<SalesOrderRow>[] {
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
      accessorKey: "orderNo",
      header: "수주번호",
      cell: ({ row }) => (
        <span className="font-mono text-[13px] font-medium">{row.original.orderNo}</span>
      ),
    },
    {
      id: "customer",
      header: "고객사",
      accessorFn: (row) => row.customer.name,
      cell: ({ row }) => (
        <span className="text-[14px]">{row.original.customer.name}</span>
      ),
    },
    {
      accessorKey: "orderDate",
      header: "수주일",
      cell: ({ row }) => (
        <span className="text-[13px] text-muted-foreground">
          {format(new Date(row.original.orderDate), "yyyy-MM-dd")}
        </span>
      ),
    },
    {
      accessorKey: "deliveryDate",
      header: "납기일",
      cell: ({ row }) => {
        const date = new Date(row.original.deliveryDate)
        const now = new Date()
        const overdue = isPast(date) && date < now
        const soon = !overdue && isWithinInterval(date, { start: now, end: addDays(now, 7) })
        return (
          <span
            className={`text-[13px] font-medium ${
              overdue ? "text-red-600" : soon ? "text-amber-600" : "text-muted-foreground"
            }`}
          >
            {format(date, "yyyy-MM-dd")}
          </span>
        )
      },
    },
    {
      id: "itemCount",
      header: "품목 수",
      cell: ({ row }) => (
        <span className="text-[13px] text-center block">{row.original.items.length}개</span>
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
      id: "totalAmount",
      header: "총금액",
      cell: ({ row }) => {
        const amount = row.original.totalAmount
        if (!amount) return <span className="text-[13px] text-muted-foreground">—</span>
        return (
          <span className="text-[13px] font-medium">
            {Number(amount).toLocaleString()} {row.original.currency}
          </span>
        )
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
            {onProcess && !["SHIPPED", "CLOSED", "CANCELLED"].includes(row.original.status) && (
              <>
                <DropdownMenuItem onClick={() => onProcess(row.original)}>
                  <ArrowRight className="mr-2 h-4 w-4" /> 수주처리
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => onEdit(row.original)}>
              <Pencil className="mr-2 h-4 w-4" /> 수정
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(row.original.id)}
              disabled={row.original.status !== "DRAFT"}
            >
              <Trash2 className="mr-2 h-4 w-4" /> 삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]
}
