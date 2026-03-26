"use client"

import { DataTable } from "@/components/common/data-table"
import { columns } from "./columns"
import { ItemWithCategory } from "@/lib/actions/item.actions"

interface ItemDataTableProps {
  items: ItemWithCategory[]
}

export function ItemDataTable({ items }: ItemDataTableProps) {
  return (
    <DataTable
      columns={columns}
      data={items}
      searchableColumns={[
        { id: "name", title: "품목명" },
      ]}
      filterableColumns={[
        {
          id: "itemType",
          title: "품목유형",
          options: [
            { label: "원자재", value: "RAW_MATERIAL" },
            { label: "반제품", value: "SEMI_FINISHED" },
            { label: "완제품", value: "FINISHED" },
            { label: "소모품", value: "CONSUMABLE" },
          ],
        },
        {
          id: "status",
          title: "상태",
          options: [
            { label: "활성", value: "ACTIVE" },
            { label: "비활성", value: "INACTIVE" },
            { label: "단종", value: "DISCONTINUED" },
          ],
        },
      ]}
    />
  )
}
