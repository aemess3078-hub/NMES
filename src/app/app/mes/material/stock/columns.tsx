"use client"

import { ColumnDef } from "@tanstack/react-table"

import { DataTableColumnHeader } from "@/components/common/data-table"
import { InventoryBalanceWithDetails } from "@/lib/actions/inventory.actions"

const itemTypeLabels: Record<string, string> = {
  RAW_MATERIAL: "원자재",
  CONSUMABLE: "소모품",
}

export function getColumns(): ColumnDef<InventoryBalanceWithDetails>[] {
  return [
    {
      id: "warehouseName",
      accessorFn: (row) => row.warehouse.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="로케이션" />
      ),
      cell: ({ row }) => (
        <span className="text-[14px] font-medium">{row.getValue("warehouseName")}</span>
      ),
      filterFn: (row, _id, filterValues: string[]) =>
        filterValues.includes(row.original.warehouseId),
    },
    {
      id: "itemCode",
      accessorFn: (row) => row.item.code,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="자재코드" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-[14px] font-medium">{row.getValue("itemCode")}</span>
      ),
    },
    {
      id: "itemName",
      accessorFn: (row) => row.item.name,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="자재명" />
      ),
      cell: ({ row }) => (
        <span className="text-[14px]">{row.getValue("itemName")}</span>
      ),
    },
    {
      id: "itemType",
      accessorFn: (row) => row.item.itemType,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="자재유형" />
      ),
      cell: ({ row }) => (
        <span className="text-[13px] text-muted-foreground">
          {itemTypeLabels[row.getValue("itemType") as string] ?? row.getValue("itemType")}
        </span>
      ),
      filterFn: (row, _id, filterValues: string[]) =>
        filterValues.includes(row.original.item.itemType),
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
          <span className="text-[13px] font-mono text-foreground">{lotNo}</span>
        ) : (
          <span className="text-[13px] text-muted-foreground">LOT 없음</span>
        )
      },
    },
    {
      id: "uom",
      accessorFn: (row) => row.item.uom,
      header: "UOM",
      cell: ({ row }) => (
        <span className="text-[13px] text-muted-foreground">{row.getValue("uom")}</span>
      ),
    },
    {
      id: "qtyOnHand",
      accessorFn: (row) => Number(row.qtyOnHand),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="현재고" />
      ),
      cell: ({ row }) => (
        <span className="text-[14px] text-right block font-medium tabular-nums">
          {(row.getValue("qtyOnHand") as number).toLocaleString()}
        </span>
      ),
    },
    {
      id: "qtyHold",
      accessorFn: (row) => Number(row.qtyHold),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="예약수량" />
      ),
      cell: ({ row }) => (
        <span className="text-[14px] text-right block text-muted-foreground tabular-nums">
          {(row.getValue("qtyHold") as number).toLocaleString()}
        </span>
      ),
    },
    {
      id: "qtyAvailable",
      accessorFn: (row) => Number(row.qtyAvailable),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="가용수량" />
      ),
      cell: ({ row }) => {
        const qty = row.getValue("qtyAvailable") as number
        return (
          <span
            className={`text-[14px] text-right block font-medium tabular-nums ${
              qty <= 0 ? "text-red-600" : "text-emerald-700"
            }`}
          >
            {qty.toLocaleString()}
          </span>
        )
      },
    },
  ]
}
