"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table/data-table"
import { getColumns } from "./columns"
import { ECNFormSheet } from "./ecn-form-sheet"
import {
  ECNWithDetails,
  deleteECN,
  submitECN,
  approveECN,
  rejectECN,
  implementECN,
} from "@/lib/actions/ecn.actions"

interface Props {
  ecns: ECNWithDetails[]
  items: { id: string; code: string; name: string; itemType: string }[]
  tenantId: string
  userId: string
}

export function ECNDataTable({ ecns, items, tenantId, userId }: Props) {
  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [editingECN, setEditingECN] = useState<ECNWithDetails | null>(null)

  const handleEdit = (ecn: ECNWithDetails) => {
    setEditingECN(ecn)
    setFormMode("edit")
    setFormOpen(true)
  }

  const handleDelete = async (ecn: ECNWithDetails) => {
    if (!confirm(`'${ecn.ecnNo}' ECN을 삭제하시겠습니까?`)) return
    try {
      await deleteECN(ecn.id)
      router.refresh()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const handleSubmit = async (ecn: ECNWithDetails) => {
    if (!confirm(`'${ecn.ecnNo}'을 검토 제출하시겠습니까?`)) return
    try {
      await submitECN(ecn.id)
      router.refresh()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const handleApprove = async (ecn: ECNWithDetails) => {
    if (!confirm(`'${ecn.ecnNo}'을 승인하시겠습니까?`)) return
    try {
      await approveECN(ecn.id, userId)
      router.refresh()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const handleReject = async (ecn: ECNWithDetails) => {
    if (!confirm(`'${ecn.ecnNo}'을 반려하시겠습니까?`)) return
    try {
      await rejectECN(ecn.id, userId)
      router.refresh()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const handleImplement = async (ecn: ECNWithDetails) => {
    if (!confirm(`'${ecn.ecnNo}'을 실제 BOM/라우팅에 적용하시겠습니까?\n\n기존 ACTIVE BOM/라우팅이 INACTIVE로 변경되고 새 버전이 생성됩니다.`)) return
    try {
      await implementECN(ecn.id)
      router.refresh()
      alert("적용이 완료되었습니다.")
    } catch (e: any) {
      alert(e.message)
    }
  }

  const columns = getColumns({
    onEdit: handleEdit,
    onDelete: handleDelete,
    onSubmit: handleSubmit,
    onApprove: handleApprove,
    onReject: handleReject,
    onImplement: handleImplement,
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditingECN(null)
            setFormMode("create")
            setFormOpen(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          ECN 등록
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={ecns}
        searchableColumns={[{ id: "title" as keyof ECNWithDetails & string, title: "제목" }]}
        filterableColumns={[
          {
            id: "status" as keyof ECNWithDetails & string,
            title: "상태",
            options: [
              { label: "초안", value: "DRAFT" },
              { label: "제출됨", value: "SUBMITTED" },
              { label: "검토중", value: "REVIEWING" },
              { label: "승인됨", value: "APPROVED" },
              { label: "반려됨", value: "REJECTED" },
              { label: "적용완료", value: "IMPLEMENTED" },
              { label: "취소됨", value: "CANCELLED" },
            ],
          },
          {
            id: "changeType" as keyof ECNWithDetails & string,
            title: "변경유형",
            options: [
              { label: "BOM", value: "BOM" },
              { label: "라우팅", value: "ROUTING" },
              { label: "BOM+라우팅", value: "BOTH" },
            ],
          },
        ]}
      />

      <ECNFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        editingECN={editingECN}
        items={items}
        tenantId={tenantId}
        userId={userId}
      />
    </div>
  )
}
