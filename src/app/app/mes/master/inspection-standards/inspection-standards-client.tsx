"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import {
  InspectionSpecWithItems,
  deleteInspectionSpec,
} from "@/lib/actions/quality.actions"
import {
  getInspectionSpecColumns,
  InspectionSpecRow,
  STATUS_CONFIG,
} from "./inspection-spec-columns"
import { InspectionSpecFormSheet } from "./inspection-spec-form-sheet"

// ─── Types ────────────────────────────────────────────────────────────────────

interface InspectionStandardsClientProps {
  tenantId: string
  specs: InspectionSpecWithItems[]
  items: { id: string; code: string; name: string }[]
  routingOperations: {
    id: string
    name: string
    seq: number
    routingId: string
    routing: { id: string; code: string; name: string; version: string }
  }[]
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InspectionStandardsClient({
  tenantId,
  specs,
  items,
  routingOperations,
}: InspectionStandardsClientProps) {
  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)
  const [editingSpec, setEditingSpec] =
    useState<InspectionSpecWithItems | null>(null)

  const rows: InspectionSpecRow[] = specs.map((spec) => ({
    ...spec,
    itemLabel: `[${spec.item.code}] ${spec.item.name}`,
    operationLabel: `${spec.routingOperation.name} (seq.${spec.routingOperation.seq})`,
  }))

  const activeCount = specs.filter((s) => s.status === "ACTIVE").length
  const totalItems = specs.reduce(
    (sum, s) => sum + s.inspectionItems.length,
    0
  )

  function handleCreate() {
    setEditingSpec(null)
    setFormOpen(true)
  }

  function handleEdit(row: InspectionSpecRow) {
    setEditingSpec(row)
    setFormOpen(true)
  }

  async function handleDelete(row: InspectionSpecRow) {
    if (
      !confirm(
        `'[${row.item.code}] ${row.item.name}' 검사표준을 삭제하시겠습니까?\n연결된 검사항목도 함께 삭제됩니다.`
      )
    )
      return
    try {
      await deleteInspectionSpec(row.id)
      router.refresh()
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "삭제 중 오류가 발생했습니다."
      )
    }
  }

  const columns = getInspectionSpecColumns({
    onEdit: handleEdit,
    onDelete: handleDelete,
  })

  return (
    <div className="space-y-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="전체 검사표준" value={specs.length} suffix="건" />
        <SummaryCard
          label="활성 표준"
          value={activeCount}
          suffix="건"
          accent="green"
        />
        <SummaryCard
          label="전체 검사항목"
          value={totalItems}
          suffix="개"
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={handleCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          검사표준 등록
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        searchableColumns={[
          { id: "itemLabel" as keyof InspectionSpecRow, title: "품목" },
          {
            id: "operationLabel" as keyof InspectionSpecRow,
            title: "공정",
          },
        ]}
        filterableColumns={[
          {
            id: "status" as keyof InspectionSpecRow,
            title: "상태",
            options: Object.entries(STATUS_CONFIG).map(([value, cfg]) => ({
              label: cfg.label,
              value,
            })),
          },
        ]}
      />

      <InspectionSpecFormSheet
        tenantId={tenantId}
        open={formOpen}
        onOpenChange={setFormOpen}
        editingSpec={editingSpec}
        items={items}
        routingOperations={routingOperations}
      />
    </div>
  )
}

// ─── 요약 카드 ────────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  suffix,
  accent,
}: {
  label: string
  value: number
  suffix?: string
  accent?: "green"
}) {
  const textColor =
    accent === "green" ? "text-emerald-700" : "text-foreground"

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-[22px] font-semibold tabular-nums ${textColor}`}
      >
        {value.toLocaleString()}
        {suffix && (
          <span className="ml-1 text-[14px] font-normal text-muted-foreground">
            {suffix}
          </span>
        )}
      </p>
    </div>
  )
}
