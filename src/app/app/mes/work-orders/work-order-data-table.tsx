"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import { getColumns } from "./columns"
import { WorkOrderFormSheet } from "./work-order-form-sheet"
import { deleteWorkOrder, WorkOrderWithDetails } from "@/lib/actions/work-order.actions"

interface WorkOrderDataTableProps {
  data: WorkOrderWithDetails[]
  sites: { id: string; code: string; name: string; type: string }[]
  items: { id: string; code: string; name: string; itemType: string }[]
  equipments: { id: string; code: string; name: string; equipmentType: string }[]
  tenantId: string
}

export function WorkOrderDataTable({
  data,
  sites,
  items,
  equipments,
  tenantId,
}: WorkOrderDataTableProps) {
  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [editingWorkOrder, setEditingWorkOrder] = useState<WorkOrderWithDetails | null>(null)

  const handleEdit = (workOrder: WorkOrderWithDetails) => {
    setEditingWorkOrder(workOrder)
    setFormMode("edit")
    setFormOpen(true)
  }

  const handleDelete = async (workOrder: WorkOrderWithDetails) => {
    const allowedStatuses = ["DRAFT", "RELEASED"]
    if (!allowedStatuses.includes(workOrder.status)) {
      alert(
        `'${workOrder.status}' 상태의 작업지시는 삭제할 수 없습니다.\nDRAFT 또는 RELEASED 상태만 삭제 가능합니다.`
      )
      return
    }

    if (!confirm(`'${workOrder.orderNo}' 작업지시를 삭제하시겠습니까?`)) return

    try {
      await deleteWorkOrder(workOrder.id)
      router.refresh()
    } catch (error) {
      console.error("삭제 실패:", error)
      alert(error instanceof Error ? error.message : "삭제 중 오류가 발생했습니다.")
    }
  }

  const columns = getColumns({
    onEdit: handleEdit,
    onDelete: handleDelete,
  })

  const filterableColumns = [
    {
      id: "status" as keyof WorkOrderWithDetails,
      title: "상태",
      options: [
        { label: "초안", value: "DRAFT" },
        { label: "릴리즈", value: "RELEASED" },
        { label: "진행중", value: "IN_PROGRESS" },
        { label: "완료", value: "COMPLETED" },
        { label: "취소", value: "CANCELLED" },
      ],
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditingWorkOrder(null)
            setFormMode("create")
            setFormOpen(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          작업지시 등록
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchableColumns={[
          { id: "orderNo" as keyof WorkOrderWithDetails, title: "작업지시번호" },
          { id: "itemName" as keyof WorkOrderWithDetails, title: "품목명" },
        ]}
        filterableColumns={filterableColumns}
      />

      <WorkOrderFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        workOrder={editingWorkOrder}
        sites={sites}
        items={items}
        equipments={equipments}
        tenantId={tenantId}
      />
    </div>
  )
}
