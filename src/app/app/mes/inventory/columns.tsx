"use client"

import { ColumnDef } from "@tanstack/react-table"

import { DataTableColumnHeader } from "@/components/common/data-table"
import { InventoryBalanceWithDetails } from "@/lib/actions/inventory.actions"

const itemTypeLabels: Record<string, string> = {
  RAW_MATERIAL: "원자재",
  SEMI_FINISHED: "반제품",
  FINISHED: "완제품",
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
      id: "itemType",
      accessorFn: (row) => row.item.itemType,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="품목유형" />
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
        <DataTableColumnHeader column={column} title="재고수량" />
      ),
      cell: ({ row }) => (
        <span className="text-[14px] text-right block font-medium">
          {(row.getValue("qtyOnHand") as number).toLocaleString()}
        </span>
      ),
    },
    {
      id: "qtyHold",
      accessorFn: (row) => Number(row.qtyHold),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="보류수량" />
      ),
      cell: ({ row }) => (
        <span className="text-[14px] text-right block text-muted-foreground">
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
            className={`text-[14px] text-right block font-medium ${
              qty <= 0 ? "text-red-600" : "text-green-700"
            }`}
          >
            {qty.toLocaleString()}
          </span>
        )
      },
    },
    {
      id: "lotNo",
      accessorFn: (row) => row.lot?.lotNo ?? null,
      header: "LOT",
      cell: ({ row }) => {
        const lotNo = row.original.lot?.lotNo
        const isLotTracked = row.original.item.isLotTracked === true
        if (lotNo) {
          return <span className="font-mono text-[13px] text-foreground">{lotNo}</span>
        }
        if (isLotTracked) {
          return (
            <span className="inline-flex flex-col items-start">
              <span className="inline-flex items-center rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[12px] font-medium text-amber-800">
                LOT 미지정
              </span>
              <span className="mt-0.5 text-[11px] text-amber-700">정리 필요</span>
            </span>
          )
        }
        return <span className="text-[13px] text-muted-foreground">LOT 미적용</span>
      },
    },
  ]
}
