"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { DataTable } from "@/components/common/data-table"
import { getColumns } from "./columns"
import { WorkCenterFormSheet } from "./work-center-form-sheet"
import { WorkCenterWithDetails, deleteWorkCenter } from "@/lib/actions/work-center.actions"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

type Props = {
  data: WorkCenterWithDetails[]
  sites: { id: string; code: string; name: string }[]
}

export function WorkCenterDataTable({ data, sites }: Props) {
  const router = useRouter()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<WorkCenterWithDetails | null>(null)

  const handleEdit = (wc: WorkCenterWithDetails) => {
    setEditTarget(wc)
    setSheetOpen(true)
  }

  const handleDelete = async (wc: WorkCenterWithDetails) => {
    if (!confirm(`"${wc.name}" 공정을 삭제하시겠습니까?`)) return
    try {
      await deleteWorkCenter(wc.id)
      router.refresh()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const columns = getColumns({ onEdit: handleEdit, onDelete: handleDelete })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => { setEditTarget(null); setSheetOpen(true) }}
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          공정 등록
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchableColumns={[{ id: "name", title: "공정명" }]}
        filterableColumns={[
          {
            id: "kind",
            title: "공정유형",
            options: [
              { label: "조립", value: "ASSEMBLY" },
              { label: "가공", value: "MACHINING" },
              { label: "검사", value: "INSPECTION" },
              { label: "포장", value: "PACKAGING" },
              { label: "창고", value: "STORAGE" },
            ],
          },
        ]}
      />

      <WorkCenterFormSheet
        mode={editTarget ? "edit" : "create"}
        workCenter={editTarget}
        sites={sites}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open)
          if (!open) setEditTarget(null)
        }}
      />
    </div>
  )
}
