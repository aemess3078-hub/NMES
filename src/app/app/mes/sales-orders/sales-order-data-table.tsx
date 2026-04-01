"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import { getColumns, SalesOrderRow } from "./columns"
import { SalesOrderFormSheet } from "./sales-order-form-sheet"
import { SalesOrderProcessDialog } from "./sales-order-process-dialog"
import { deleteSalesOrder } from "@/lib/actions/sales-order.actions"

type CustomerOption = { id: string; name: string; code: string }
type ItemOption = { id: string; code: string; name: string }

interface SalesOrderDataTableProps {
  data: SalesOrderRow[]
  tenantId: string
  siteId: string
  customers: CustomerOption[]
  items: ItemOption[]
}

export function SalesOrderDataTable({
  data,
  tenantId,
  siteId,
  customers,
  items,
}: SalesOrderDataTableProps) {
  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [editingOrder, setEditingOrder] = useState<SalesOrderRow | null>(null)
  const [processDialogOpen, setProcessDialogOpen] = useState(false)
  const [processingOrder, setProcessingOrder] = useState<SalesOrderRow | null>(null)

  const handleEdit = (row: SalesOrderRow) => {
    setEditingOrder(row)
    setFormMode("edit")
    setFormOpen(true)
  }

  const handleProcess = (row: SalesOrderRow) => {
    setProcessingOrder(row)
    setProcessDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    const order = data.find((d) => d.id === id)
    if (!order) return

    if (order.status !== "DRAFT") {
      alert("DRAFT 상태인 수주만 삭제할 수 있습니다.")
      return
    }

    if (!confirm(`'${order.orderNo}' 수주를 삭제하시겠습니까?`)) return

    try {
      await deleteSalesOrder(id)
      router.refresh()
    } catch (error) {
      console.error("삭제 실패:", error)
      alert(error instanceof Error ? error.message : "삭제 중 오류가 발생했습니다.")
    }
  }

  const columns = getColumns(handleEdit, handleDelete, handleProcess)

  const filterableColumns = [
    {
      id: "status" as keyof SalesOrderRow,
      title: "상태",
      options: [
        { label: "초안", value: "DRAFT" },
        { label: "확정", value: "CONFIRMED" },
        { label: "생산중", value: "IN_PRODUCTION" },
        { label: "부분출하", value: "PARTIAL_SHIPPED" },
        { label: "출하완료", value: "SHIPPED" },
        { label: "완료", value: "CLOSED" },
        { label: "취소", value: "CANCELLED" },
      ],
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditingOrder(null)
            setFormMode("create")
            setFormOpen(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          수주 등록
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchableColumns={[
          { id: "orderNo" as keyof SalesOrderRow, title: "수주번호" },
        ]}
        filterableColumns={filterableColumns}
      />

      <SalesOrderFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        salesOrder={editingOrder}
        tenantId={tenantId}
        siteId={siteId}
        customers={customers}
        items={items}
      />

      <SalesOrderProcessDialog
        open={processDialogOpen}
        onOpenChange={setProcessDialogOpen}
        salesOrder={processingOrder}
        tenantId={tenantId}
        siteId={siteId}
      />
    </div>
  )
}
