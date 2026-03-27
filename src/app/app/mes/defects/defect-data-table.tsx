"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import { DefectCodeRow, deleteDefectCode } from "@/lib/actions/quality.actions"
import { getDefectColumns, DEFECT_CATEGORY_CONFIG } from "./defect-columns"
import { DefectFormSheet } from "./defect-form-sheet"

// ─── Types ────────────────────────────────────────────────────────────────────

interface DefectDataTableProps {
  data: DefectCodeRow[]
  tenantId: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DefectDataTable({ data, tenantId }: DefectDataTableProps) {
  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)
  const [editingRow, setEditingRow] = useState<DefectCodeRow | null>(null)

  function handleCreate() {
    setEditingRow(null)
    setFormOpen(true)
  }

  function handleEdit(row: DefectCodeRow) {
    setEditingRow(row)
    setFormOpen(true)
  }

  async function handleDelete(row: DefectCodeRow) {
    if (!confirm(`'${row.name}' 불량코드를 삭제하시겠습니까?`)) return
    try {
      await deleteDefectCode(row.id)
      router.refresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : "삭제 중 오류가 발생했습니다.")
    }
  }

  const columns = getDefectColumns({ onEdit: handleEdit, onDelete: handleDelete })

  const filterableColumns = [
    {
      id: "defectCategory" as keyof DefectCodeRow,
      title: "불량유형",
      options: Object.entries(DEFECT_CATEGORY_CONFIG).map(([value, cfg]) => ({
        label: cfg.label,
        value,
      })),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          불량코드 등록
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchableColumns={[
          { id: "code" as keyof DefectCodeRow, title: "불량코드" },
          { id: "name" as keyof DefectCodeRow, title: "불량명" },
        ]}
        filterableColumns={filterableColumns}
      />

      <DefectFormSheet
        tenantId={tenantId}
        open={formOpen}
        onOpenChange={setFormOpen}
        editingRow={editingRow}
      />
    </div>
  )
}
