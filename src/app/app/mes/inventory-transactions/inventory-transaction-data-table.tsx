"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import { getColumns } from "./columns"
import { TransactionFormSheet } from "./transaction-form-sheet"
import { InventoryTransactionWithDetails } from "@/lib/actions/inventory.actions"

interface InventoryTransactionDataTableProps {
  data: InventoryTransactionWithDetails[]
  sites: { id: string; code: string; name: string }[]
  locations: { id: string; code: string; name: string; siteId: string }[]
  tenantId: string
}

export function InventoryTransactionDataTable({
  data,
  sites,
  locations,
  tenantId,
}: InventoryTransactionDataTableProps) {
  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)

  const columns = getColumns()

  const filterableColumns = [
    {
      id: "txType" as keyof InventoryTransactionWithDetails,
      title: "유형",
      options: [
        { label: "입고", value: "RECEIPT" },
        { label: "출고", value: "ISSUE" },
        { label: "이동", value: "TRANSFER" },
        { label: "재고조정", value: "ADJUST" },
        { label: "반품", value: "RETURN" },
        { label: "폐기", value: "SCRAP" },
      ],
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          트랜잭션 등록
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchableColumns={[
          { id: "itemName" as keyof InventoryTransactionWithDetails, title: "품목명" },
          { id: "txNo" as keyof InventoryTransactionWithDetails, title: "전표번호" },
        ]}
        filterableColumns={filterableColumns}
      />

      <TransactionFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        sites={sites}
        locations={locations}
        tenantId={tenantId}
      />
    </div>
  )
}
