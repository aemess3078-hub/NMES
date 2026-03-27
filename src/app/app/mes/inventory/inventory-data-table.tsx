"use client"

import { DataTable } from "@/components/common/data-table"
import { getColumns } from "./columns"
import { InventoryBalanceWithDetails } from "@/lib/actions/inventory.actions"

interface InventoryDataTableProps {
  data: InventoryBalanceWithDetails[]
  warehouses: { id: string; code: string; name: string; siteId: string }[]
}

export function InventoryDataTable({ data, warehouses }: InventoryDataTableProps) {
  const columns = getColumns()

  const filterableColumns = [
    {
      id: "warehouseName" as keyof InventoryBalanceWithDetails,
      title: "창고",
      options: warehouses.map((w) => ({ label: w.name, value: w.id })),
    },
    {
      id: "itemType" as keyof InventoryBalanceWithDetails,
      title: "품목유형",
      options: [
        { label: "원자재", value: "RAW_MATERIAL" },
        { label: "반제품", value: "SEMI_FINISHED" },
        { label: "완제품", value: "FINISHED" },
        { label: "소모품", value: "CONSUMABLE" },
      ],
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={data}
      searchableColumns={[
        { id: "itemCode" as keyof InventoryBalanceWithDetails, title: "품목코드" },
        { id: "itemName" as keyof InventoryBalanceWithDetails, title: "품목명" },
      ]}
      filterableColumns={filterableColumns}
    />
  )
}
