"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Download, FileSpreadsheet, Plus, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import { getColumns } from "./columns"
import { RoutingFormSheet } from "./routing-form-sheet"
import { RoutingDetailPanel } from "./routing-detail-panel"
import { RoutingExcelUploadDialog } from "./routing-excel-upload-dialog"
import { downloadRoutingTemplate, downloadRoutingData } from "./routing-excel-download"
import { getRoutingExportData } from "@/lib/actions/routing-excel.actions"
import { deleteRouting, RoutingWithDetails } from "@/lib/actions/routing.actions"
import { useUserRole } from "@/lib/contexts/user-role-context"

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
  const canMutate = useUserRole() !== "VIEWER"
  const [formOpen, setFormOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [editingRouting, setEditingRouting] = useState<RoutingWithDetails | null>(null)
  const [detailRouting, setDetailRouting] = useState<RoutingWithDetails | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  const handleDownloadCurrent = async () => {
    setIsDownloading(true)
    try {
      const rows = await getRoutingExportData()
      await downloadRoutingData(rows)
    } finally {
      setIsDownloading(false)
    }
  }

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

  const handleView = (routing: RoutingWithDetails) => {
    setDetailRouting((prev) => (prev?.id === routing.id ? null : routing))
  }

  const allColumns = getColumns({
    onView: handleView,
    onEdit: handleEdit,
    onDelete: handleDelete,
  })
  const columns = canMutate ? allColumns : allColumns.filter((c) => c.id !== "actions")

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={downloadRoutingTemplate} className="gap-2">
          <Download className="h-4 w-4" />
          엑셀 양식
        </Button>
        <Button variant="outline" onClick={handleDownloadCurrent} disabled={isDownloading} className="gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          {isDownloading ? "다운로드 중..." : "현재 라우팅 다운로드"}
        </Button>
        {canMutate && (
          <Button variant="outline" onClick={() => setUploadOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" />
            엑셀 업로드
          </Button>
        )}
        {canMutate && (
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
        )}
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

      {detailRouting && (
        <RoutingDetailPanel
          routing={detailRouting}
          onClose={() => setDetailRouting(null)}
        />
      )}

      <RoutingFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        routing={editingRouting}
        items={items}
        workCenters={workCenters}
        tenantId={tenantId}
      />
      <RoutingExcelUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  )
}
