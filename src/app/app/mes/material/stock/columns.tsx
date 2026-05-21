"use client"

import { type ColumnDef } from "@tanstack/react-table"

import { DataTableColumnHeader } from "@/components/common/data-table"
import { type InventoryBalanceWithDetails } from "@/lib/actions/inventory.actions"

const itemTypeLabels: Record<string, string> = {
  RAW_MATERIAL: "원자재",
  CONSUMABLE: "소모품",
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toISOString().slice(0, 10)
}

function dateSortValue(value: Date | string | null | undefined): string {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString()
}

export function getColumns(): ColumnDef<InventoryBalanceWithDetails>[] {
  return [
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
        <DataTableColumnHeader column={column} title="소재명/품목명" />
      ),
      cell: ({ row }) => (
        <span className="text-[14px] font-medium">{row.getValue("itemName")}</span>
      ),
    },
    {
      id: "spec",
      accessorFn: (row) => row.item.spec ?? "",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="규격" />
      ),
      cell: ({ row }) => (
        <span className="text-[14px] text-muted-foreground">{row.getValue("spec") || "-"}</span>
      ),
    },
    {
      id: "lotNo",
      accessorFn: (row) => row.lot?.lotNo ?? "",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="LOT 번호" />
      ),
      cell: ({ row }) => {
        const lotNo = row.original.lot?.lotNo
        return lotNo ? (
          <span className="font-mono text-[13px] text-foreground">{lotNo}</span>
        ) : (
          <span className="text-[13px] text-muted-foreground">LOT 없음</span>
        )
      },
    },
    {
      id: "qtyOnHand",
      accessorFn: (row) => Number(row.qtyOnHand),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="현재고" />
      ),
      cell: ({ row }) => (
        <span className="block text-right text-[14px] font-semibold tabular-nums">
          {(row.getValue("qtyOnHand") as number).toLocaleString()}
        </span>
      ),
    },
    {
      id: "qtyAvailable",
      accessorFn: (row) => Number(row.qtyAvailable),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="가용재고" />
      ),
      cell: ({ row }) => {
        const qty = row.getValue("qtyAvailable") as number
        return (
          <span
            className={`block text-right text-[14px] font-semibold tabular-nums ${
              qty <= 0 ? "text-red-600" : "text-emerald-700"
            }`}
          >
            {qty.toLocaleString()}
          </span>
        )
      },
    },
    {
      id: "qtyHold",
      accessorFn: (row) => Number(row.qtyHold),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="보류재고" />
      ),
      cell: ({ row }) => (
        <span className="block text-right text-[14px] text-muted-foreground tabular-nums">
          {(row.getValue("qtyHold") as number).toLocaleString()}
        </span>
      ),
    },
    {
      id: "uom",
      accessorFn: (row) => row.item.uom,
      header: "단위",
      cell: ({ row }) => (
        <span className="text-[13px] text-muted-foreground">{row.getValue("uom")}</span>
      ),
    },
    {
      id: "warehouseName",
      accessorFn: (row) => row.warehouse.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="창고/위치" />
      ),
      cell: ({ row }) => (
        <div className="text-[14px]">
          <div className="font-medium">{row.original.warehouse.name}</div>
          <div className="text-[13px] text-muted-foreground">{row.original.warehouse.site.name}</div>
        </div>
      ),
      filterFn: (row, _id, filterValues: string[]) =>
        filterValues.includes(row.original.warehouseId),
    },
    {
      id: "lastReceiptAt",
      accessorFn: (row) => dateSortValue(row.lastReceiptAt),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="입고일" />
      ),
      cell: ({ row }) => (
        <span className="text-[13px] text-muted-foreground">
          {formatDate(row.original.lastReceiptAt ?? row.original.lot?.manufactureDate)}
        </span>
      ),
    },
    {
      id: "lastIssueAt",
      accessorFn: (row) => dateSortValue(row.lastIssueAt),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="최근 출고일" />
      ),
      cell: ({ row }) => (
        <span className="text-[13px] text-muted-foreground">
          {formatDate(row.original.lastIssueAt)}
        </span>
      ),
    },
    {
      id: "itemType",
      accessorFn: (row) => row.item.itemType,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="비고" />
      ),
      cell: ({ row }) => (
        <span className="text-[13px] text-muted-foreground">
          {itemTypeLabels[row.original.item.itemType] ?? row.original.item.itemType}
          {row.original.item.isLotTracked ? " / LOT 관리" : ""}
        </span>
      ),
      filterFn: (row, _id, filterValues: string[]) =>
        filterValues.includes(row.original.item.itemType),
    },
  ]
}
