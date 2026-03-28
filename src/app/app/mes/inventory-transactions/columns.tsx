"use client"

import { ColumnDef } from "@tanstack/react-table"
import { TransactionType } from "@prisma/client"

import { Badge } from "@/components/ui/badge"
import { DataTableColumnHeader } from "@/components/common/data-table"
import { InventoryTransactionWithDetails } from "@/lib/actions/inventory.actions"

const txTypeLabels: Record<TransactionType, string> = {
  RECEIPT: "입고",
  ISSUE: "출고",
  TRANSFER: "이동",
  ADJUST: "재고조정",
  RETURN: "반품",
  SCRAP: "폐기",
}

const txTypeBadgeClass: Record<TransactionType, string> = {
  RECEIPT: "bg-green-100 text-green-800 border-green-200 hover:bg-green-100",
  ISSUE: "bg-red-100 text-red-800 border-red-200 hover:bg-red-100",
  TRANSFER: "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100",
  ADJUST: "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100",
  RETURN: "bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100",
  SCRAP: "bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-100",
}

function formatDateTime(date: Date): string {
  return new Date(date)
    .toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(/\. /g, "-")
    .replace(/\./g, "")
    .trim()
}

export function getColumns(): ColumnDef<InventoryTransactionWithDetails>[] {
  return [
    {
      id: "txAt",
      accessorFn: (row) => row.txAt,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="일시" />
      ),
      cell: ({ row }) => (
        <span className="text-[13px] text-muted-foreground whitespace-nowrap">
          {formatDateTime(row.original.txAt)}
        </span>
      ),
    },
    {
      id: "txNo",
      accessorKey: "txNo",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="전표번호" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-[13px] font-medium">{row.getValue("txNo")}</span>
      ),
    },
    {
      id: "txType",
      accessorKey: "txType",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="유형" />
      ),
      cell: ({ row }) => {
        const txType = row.getValue("txType") as TransactionType
        return (
          <Badge className={`text-[13px] ${txTypeBadgeClass[txType]}`}>
            {txTypeLabels[txType]}
          </Badge>
        )
      },
      filterFn: (row, id, filterValues: string[]) =>
        filterValues.includes(row.getValue(id)),
    },
    {
      id: "fromLocation",
      accessorFn: (row) => row.fromLocation?.name ?? null,
      header: "출발 로케이션",
      cell: ({ row }) => (
        <span className="text-[14px] text-muted-foreground">
          {row.original.fromLocation?.name ?? "—"}
        </span>
      ),
    },
    {
      id: "toLocation",
      accessorFn: (row) => row.toLocation?.name ?? null,
      header: "도착 로케이션",
      cell: ({ row }) => (
        <span className="text-[14px] text-muted-foreground">
          {row.original.toLocation?.name ?? "—"}
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
        <span className="font-mono text-[14px] font-medium">{row.getValue("itemCode")}</span>
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
      id: "lotNo",
      accessorFn: (row) => row.lot?.lotNo ?? null,
      header: "LOT",
      cell: ({ row }) => (
        <span className="text-[13px] text-muted-foreground font-mono">
          {row.getValue("lotNo") ?? "—"}
        </span>
      ),
    },
    {
      id: "qty",
      accessorFn: (row) => Number(row.qty),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="수량" />
      ),
      cell: ({ row }) => {
        const txType = row.original.txType
        const qty = row.getValue("qty") as number
        const isPositive = txType === "RECEIPT" || txType === "RETURN"
        const isNegative = txType === "ISSUE" || txType === "SCRAP"
        return (
          <span
            className={`text-[14px] text-right block font-medium ${
              isPositive ? "text-green-700" : isNegative ? "text-red-600" : ""
            }`}
          >
            {isPositive ? "+" : isNegative ? "-" : ""}
            {qty.toLocaleString()}
          </span>
        )
      },
    },
    {
      id: "refType",
      accessorKey: "refType",
      header: "참조유형",
      cell: ({ row }) => (
        <span className="text-[13px] text-muted-foreground">
          {row.getValue("refType") ?? "—"}
        </span>
      ),
    },
  ]
}
