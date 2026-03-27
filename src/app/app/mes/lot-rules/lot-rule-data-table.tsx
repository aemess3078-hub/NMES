"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Pencil, Trash2 } from "lucide-react"
import { ColumnDef } from "@tanstack/react-table"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import { LotRuleFormSheet } from "./lot-rule-form-sheet"
import { deleteLotRule } from "@/lib/actions/lot.actions"

// ─── Types ────────────────────────────────────────────────────────────────────

type LotRuleRow = {
  id: string
  tenantId: string
  itemId: string
  prefix: string | null
  dateFormat: string | null
  seqLength: number
  item: { id: string; code: string; name: string; itemType: string }
}

interface LotRuleDataTableProps {
  data: LotRuleRow[]
  items: { id: string; code: string; name: string; itemType: string }[]
  tenantId: string
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  RAW_MATERIAL:  "원자재",
  SEMI_FINISHED: "반제품",
  FINISHED:      "완제품",
  CONSUMABLE:    "소모품",
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LotRuleDataTable({ data, items, tenantId }: LotRuleDataTableProps) {
  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [editingRule, setEditingRule] = useState<LotRuleRow | null>(null)

  const handleEdit = (rule: LotRuleRow) => {
    setEditingRule(rule)
    setFormMode("edit")
    setFormOpen(true)
  }

  const handleDelete = async (rule: LotRuleRow) => {
    if (!confirm(`'${rule.item.name}' 품목의 LOT 규칙을 삭제하시겠습니까?`)) return
    try {
      await deleteLotRule(rule.id)
      router.refresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : "삭제 중 오류가 발생했습니다.")
    }
  }

  const columns: ColumnDef<LotRuleRow>[] = [
    {
      accessorKey: "item.code",
      id: "itemCode",
      header: "품목코드",
      cell: ({ row }) => (
        <span className="font-mono text-[13px]">{row.original.item.code}</span>
      ),
    },
    {
      accessorKey: "item.name",
      id: "itemName",
      header: "품목명",
      cell: ({ row }) => (
        <span className="text-[14px]">{row.original.item.name}</span>
      ),
    },
    {
      accessorKey: "item.itemType",
      id: "itemType",
      header: "품목유형",
      cell: ({ row }) => (
        <span className="text-[13px] text-muted-foreground">
          {ITEM_TYPE_LABELS[row.original.item.itemType] ?? row.original.item.itemType}
        </span>
      ),
    },
    {
      accessorKey: "prefix",
      header: "Prefix",
      cell: ({ row }) => (
        <span className="font-mono text-[13px]">
          {row.original.prefix ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "dateFormat",
      header: "날짜 형식",
      cell: ({ row }) => (
        <span className="font-mono text-[13px] text-muted-foreground">
          {row.original.dateFormat ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "seqLength",
      header: "순번 자릿수",
      cell: ({ row }) => (
        <span className="text-[14px] font-medium">{row.original.seqLength}</span>
      ),
    },
    {
      id: "example",
      header: "번호 예시",
      cell: ({ row }) => {
        const r = row.original
        const seq = "0".repeat(r.seqLength - 1) + "1"
        return (
          <span className="font-mono text-[12px] text-muted-foreground">
            {[r.prefix, r.dateFormat ? "YYYYMMDD" : null, seq]
              .filter(Boolean)
              .join("-")}
          </span>
        )
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => handleEdit(row.original)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => handleDelete(row.original)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setFormMode("create")
            setEditingRule(null)
            setFormOpen(true)
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          규칙 추가
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchableColumns={[
          { id: "itemName" as keyof LotRuleRow, title: "품목명" },
          { id: "itemCode" as keyof LotRuleRow, title: "품목코드" },
        ]}
      />

      <LotRuleFormSheet
        mode={formMode}
        rule={editingRule}
        items={items}
        tenantId={tenantId}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
    </div>
  )
}
