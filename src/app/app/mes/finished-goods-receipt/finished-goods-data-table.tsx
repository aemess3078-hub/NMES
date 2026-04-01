"use client"

import { useState } from "react"
import { DataTable } from "@/components/common/data-table"
import { getColumns } from "./columns"
import { ReceiptDialog } from "./receipt-dialog"
import {
  WorkOrderForReceipt,
  WarehouseWithLocations,
} from "@/lib/actions/finished-goods.actions"

interface FinishedGoodsDataTableProps {
  data: WorkOrderForReceipt[]
  warehouses: WarehouseWithLocations[]
  tenantId: string
}

export function FinishedGoodsDataTable({
  data,
  warehouses,
  tenantId,
}: FinishedGoodsDataTableProps) {
  const [receiptTarget, setReceiptTarget] = useState<WorkOrderForReceipt | null>(null)
  const [receiptOpen, setReceiptOpen] = useState(false)

  const columns = getColumns({
    onReceipt: (wo) => {
      setReceiptTarget(wo)
      setReceiptOpen(true)
    },
  })

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        searchableColumns={[
          { id: "orderNo" as keyof WorkOrderForReceipt, title: "작업지시번호" },
          { id: "itemName" as keyof WorkOrderForReceipt, title: "품목명" },
        ]}
      />

      <ReceiptDialog
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        workOrder={receiptTarget}
        warehouses={warehouses}
        tenantId={tenantId}
      />
    </>
  )
}
