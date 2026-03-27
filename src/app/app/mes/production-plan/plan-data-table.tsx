"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import { getColumns } from "./columns"
import { PlanFormSheet } from "./plan-form-sheet"
import { deletePlan, PlanWithDetails } from "@/lib/actions/production-plan.actions"

interface PlanDataTableProps {
  data: PlanWithDetails[]
  sites: { id: string; code: string; name: string; type: string }[]
  items: { id: string; code: string; name: string; itemType: string }[]
  tenantId: string
}

export function PlanDataTable({ data, sites, items, tenantId }: PlanDataTableProps) {
  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [editingPlan, setEditingPlan] = useState<PlanWithDetails | null>(null)

  const handleEdit = (plan: PlanWithDetails) => {
    setEditingPlan(plan)
    setFormMode("edit")
    setFormOpen(true)
  }

  const handleDelete = async (plan: PlanWithDetails) => {
    if (plan.status !== "DRAFT") {
      alert(
        `'${plan.status}' 상태의 생산계획은 삭제할 수 없습니다.\nDRAFT 상태만 삭제 가능합니다.`
      )
      return
    }

    if (!confirm(`'${plan.planNo}' 생산계획을 삭제하시겠습니까?`)) return

    try {
      await deletePlan(plan.id)
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
      id: "status" as keyof PlanWithDetails,
      title: "상태",
      options: [
        { label: "초안", value: "DRAFT" },
        { label: "확정", value: "CONFIRMED" },
        { label: "진행중", value: "IN_PROGRESS" },
        { label: "완료", value: "COMPLETED" },
        { label: "취소", value: "CANCELLED" },
      ],
    },
    {
      id: "planType" as keyof PlanWithDetails,
      title: "계획유형",
      options: [
        { label: "일간", value: "DAILY" },
        { label: "주간", value: "WEEKLY" },
        { label: "월간", value: "MONTHLY" },
      ],
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditingPlan(null)
            setFormMode("create")
            setFormOpen(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          생산계획 등록
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchableColumns={[
          { id: "planNo" as keyof PlanWithDetails, title: "계획번호 검색..." },
        ]}
        filterableColumns={filterableColumns}
      />

      <PlanFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        plan={editingPlan}
        sites={sites}
        items={items}
        tenantId={tenantId}
      />
    </div>
  )
}
