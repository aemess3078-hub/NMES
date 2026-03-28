"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import { getColumns } from "./columns"
import { RoutingFormSheet } from "./routing-form-sheet"
import { deleteRouting, RoutingWithDetails } from "@/lib/actions/routing.actions"

interface WorkCenter {
  id: string
  code: string
  name: string
}

interface ItemOption {
  id: string
  code: string
  name: string
  itemType: string
}

interface RoutingDataTableProps {
  data: RoutingWithDetails[]
  items: ItemOption[]
  workCenters: WorkCenter[]
  tenantId: string
}

export function RoutingDataTable({
  data,
  items,
  workCenters,
  tenantId,
}: RoutingDataTableProps) {
  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [editingRouting, setEditingRouting] = useState<RoutingWithDetails | null>(null)

  const handleEdit = (routing: RoutingWithDetails) => {
    setEditingRouting(routing)
    setFormMode("edit")
    setFormOpen(true)
  }

  const handleDelete = async (routing: RoutingWithDetails) => {
    if (!confirm(`'${routing.name} (v${routing.version})' 라우팅을 삭제하시겠습니까?`)) return
    try {
      await deleteRouting(routing.id)
      router.refresh()
    } catch (error) {
      console.error("삭제 실패:", error)
    }
  }

  const columns = getColumns({
    onEdit: handleEdit,
    onDelete: handleDelete,
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditingRouting(null)
            setFormMode("create")
            setFormOpen(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          라우팅 등록
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchableColumns={[{ id: "itemName" as keyof RoutingWithDetails, title: "품목명" }]}
        filterableColumns={[
          {
            id: "itemType" as keyof RoutingWithDetails,
            title: "품목유형",
            options: [
              { label: "반제품", value: "SEMI_FINISHED" },
              { label: "완제품", value: "FINISHED" },
            ],
          },
          {
            id: "status" as keyof RoutingWithDetails,
            title: "상태",
            options: [
              { label: "초안", value: "DRAFT" },
              { label: "활성", value: "ACTIVE" },
              { label: "비활성", value: "INACTIVE" },
            ],
          },
        ]}
      />

      <RoutingFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        routing={editingRouting}
        items={items}
        workCenters={workCenters}
        tenantId={tenantId}
      />
    </div>
  )
}
