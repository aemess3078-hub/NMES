"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import { Send } from "lucide-react"
import { getColumns } from "./columns"
import { WorkOrderFormSheet } from "./work-order-form-sheet"
import {
  deleteWorkOrder,
  releaseWorkOrder,
  type ProductionPlanItemForWorkOrder,
  type WorkOrderWithDetails,
} from "@/lib/actions/work-order.actions"
import { useUserRole } from "@/lib/contexts/user-role-context"

interface WorkOrderDataTableProps {
  data: WorkOrderWithDetails[]
  sites: { id: string; code: string; name: string; type: string }[]
  items: { id: string; code: string; name: string; itemType: string }[]
  equipments: { id: string; code: string; name: string; equipmentType: string; workCenterId: string }[]
  productionPlanItems: ProductionPlanItemForWorkOrder[]
  tenantId: string
}

const operationStatusConfig: Record<string, { label: string; className: string }> = {
  PENDING: { label: "대기", className: "border-slate-200 bg-slate-50 text-slate-700" },
  IN_PROGRESS: { label: "진행중", className: "border-amber-200 bg-amber-50 text-amber-700" },
  COMPLETED: { label: "완료", className: "border-green-200 bg-green-50 text-green-700" },
  CANCELLED: { label: "취소", className: "border-red-200 bg-red-50 text-red-700" },
  SKIPPED: { label: "건너뜀", className: "border-zinc-200 bg-zinc-50 text-zinc-600" },
}

function displayProcessName(processName: string): string {
  return processName.includes("후처리") ? "후처리공정" : processName
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)}`
}

function getOperationDateTime(operation: WorkOrderWithDetails["operations"][number]): string {
  const startedAt = operation.productionResults.find((result) => result.startedAt)?.startedAt
  const completedAt = [...operation.productionResults]
    .reverse()
    .find((result) => result.endedAt)?.endedAt

  if (completedAt) return formatDateTime(completedAt)
  return formatDateTime(startedAt)
}

function getOperationEquipmentLabel(operation: WorkOrderWithDetails["operations"][number]): string {
  if (operation.assignments.length > 1) {
    return `${operation.assignments[0].equipment.name} 외 ${operation.assignments.length - 1}대`
  }
  if (operation.assignments.length === 1) {
    return operation.assignments[0].equipment.name
  }
  return operation.equipment?.name ?? "-"
}

function OperationStatusBadge({ status }: { status: string }) {
  const config = operationStatusConfig[status]
  return (
    <Badge
      variant="outline"
      className={`text-[13px] ${config?.className ?? "border-slate-200 bg-slate-50 text-slate-700"}`}
    >
      {config?.label ?? (status || "미정")}
    </Badge>
  )
}

function WorkOrderExpandedRow({ workOrder }: { workOrder: WorkOrderWithDetails }) {
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[1.1fr_1fr]">
      <section className="rounded-md border bg-white">
        <div className="border-b px-4 py-3">
          <h3 className="text-[15px] font-semibold text-foreground">공정 진행 요약</h3>
        </div>
        {workOrder.operations.length === 0 ? (
          <p className="px-4 py-6 text-center text-[14px] text-muted-foreground">
            등록된 공정이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[14px]">
              <thead>
                <tr className="border-b bg-slate-50 text-[13px] text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">순서</th>
                  <th className="px-4 py-2 text-left font-medium">공정명</th>
                  <th className="px-4 py-2 text-left font-medium">설비</th>
                  <th className="px-4 py-2 text-left font-medium">상태</th>
                  <th className="px-4 py-2 text-right font-medium">계획수량</th>
                  <th className="px-4 py-2 text-right font-medium">완료수량</th>
                  <th className="px-4 py-2 text-left font-medium">일시</th>
                </tr>
              </thead>
              <tbody>
                {workOrder.operations.map((operation) => (
                  <tr key={operation.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 text-muted-foreground">{operation.seq}</td>
                    <td className="px-4 py-2.5 font-medium">
                      {displayProcessName(operation.routingOperation.name)}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-muted-foreground">
                      {getOperationEquipmentLabel(operation)}
                    </td>
                    <td className="px-4 py-2.5">
                      <OperationStatusBadge status={operation.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {operation.plannedQty.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {operation.completedQty.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[13px] text-muted-foreground">
                      {getOperationDateTime(operation)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-md border bg-white">
        <div className="border-b px-4 py-3">
          <h3 className="text-[15px] font-semibold text-foreground">투입 원자재 LOT</h3>
        </div>
        {workOrder.materialLots.length === 0 ? (
          <p className="px-4 py-6 text-center text-[14px] text-muted-foreground">
            투입된 원자재 LOT가 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-[14px]">
              <thead>
                <tr className="border-b bg-slate-50 text-[13px] text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">품목코드</th>
                  <th className="px-4 py-2 text-left font-medium">품목명</th>
                  <th className="px-4 py-2 text-left font-medium">규격</th>
                  <th className="px-4 py-2 text-left font-medium">LOT 번호</th>
                  <th className="px-4 py-2 text-right font-medium">투입수량</th>
                  <th className="px-4 py-2 text-left font-medium">단위</th>
                  <th className="px-4 py-2 text-left font-medium">투입일시</th>
                </tr>
              </thead>
              <tbody>
                {workOrder.materialLots.map((lot) => (
                  <tr key={lot.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-mono text-[13px]">{lot.materialItem.code}</td>
                    <td className="px-4 py-2.5 font-medium">{lot.materialItem.name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{lot.materialItem.spec ?? "-"}</td>
                    <td className="px-4 py-2.5 font-mono text-[13px] text-blue-700">
                      {lot.materialLotNo}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {lot.qty.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {lot.unit ?? lot.materialItem.uom ?? "-"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[13px] text-muted-foreground">
                      {formatDateTime(lot.issuedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export function WorkOrderDataTable({
  data,
  sites,
  items,
  equipments,
  productionPlanItems,
  tenantId,
}: WorkOrderDataTableProps) {
  const router = useRouter()
  const canMutate = useUserRole() !== "VIEWER"
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [editingWorkOrder, setEditingWorkOrder] = useState<WorkOrderWithDetails | null>(null)

  const handleEdit = (workOrder: WorkOrderWithDetails) => {
    setEditingWorkOrder(workOrder)
    setFormMode("edit")
    setFormOpen(true)
  }

  const handleRelease = async (workOrder: WorkOrderWithDetails) => {
    if (!confirm(`'${workOrder.orderNo}' 작업지시를 릴리즈(작업지시 내리기)하시겠습니까?\n작업자가 POP에서 해당 작업을 볼 수 있게 됩니다.`)) return
    try {
      const result = await releaseWorkOrder(workOrder.id)
      if (!result.success) {
        alert(result.error ?? "릴리즈 중 오류가 발생했습니다.")
        return
      }
      router.refresh()
    } catch (error) {
      console.error("릴리즈 실패:", error)
      alert(error instanceof Error ? error.message : "릴리즈 중 오류가 발생했습니다.")
    }
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

  const allColumns = getColumns({
    onEdit: handleEdit,
    onDelete: handleDelete,
    onRelease: handleRelease,
  })
  const columns = canMutate ? allColumns : allColumns.filter((c) => c.id !== "actions")

  const filterableColumns = [
    {
      id: "status" as keyof WorkOrderWithDetails,
      title: "상태",
      options: [
        { label: "초안", value: "DRAFT" },
        { label: "작업대기", value: "RELEASED" },
        { label: "진행중", value: "IN_PROGRESS" },
        { label: "완료", value: "COMPLETED" },
        { label: "취소", value: "CANCELLED" },
      ],
    },
  ]

  return (
    <div className="space-y-4">
      {canMutate && (
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
      )}

      <DataTable
        columns={columns}
        data={data}
        searchableColumns={[
          { id: "orderNo" as keyof WorkOrderWithDetails, title: "작업지시번호" },
          { id: "manufacturingNo" as keyof WorkOrderWithDetails, title: "제조번호" },
          { id: "itemName" as keyof WorkOrderWithDetails, title: "품목명" },
        ]}
        filterableColumns={filterableColumns}
        defaultSorting={[{ id: "createdAt", desc: true }]}
        renderExpandedRow={(workOrder) => (
          <WorkOrderExpandedRow workOrder={workOrder} />
        )}
      />

      <WorkOrderFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        workOrder={editingWorkOrder}
        sites={sites}
        items={items}
        equipments={equipments}
        productionPlanItems={productionPlanItems}
        tenantId={tenantId}
      />
    </div>
  )
}
