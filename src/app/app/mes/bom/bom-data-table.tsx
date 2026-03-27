"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import { getColumns } from "./columns"
import { BomFormSheet } from "./bom-form-sheet"
import { deleteBom, BOMWithDetails } from "@/lib/actions/bom.actions"
import { BOMFormValues } from "./bom-form-schema"
import { BOMStatus } from "@prisma/client"

interface ParentItem {
  id: string
  code: string
  name: string
  itemType: string
}

interface ComponentItem {
  id: string
  code: string
  name: string
  itemType: string
  uom: string
}

interface BomDataTableProps {
  boms: BOMWithDetails[]
  parentItems: ParentItem[]
  componentItems: ComponentItem[]
  tenantId: string
}

export function BomDataTable({
  boms,
  parentItems,
  componentItems,
  tenantId,
}: BomDataTableProps) {
  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [editingBom, setEditingBom] = useState<BOMWithDetails | null>(null)

  const handleEdit = (bom: BOMWithDetails) => {
    setEditingBom(bom)
    setFormMode("edit")
    setFormOpen(true)
  }

  const handleDelete = async (bom: BOMWithDetails) => {
    if (!confirm(`'${bom.item.name} (v${bom.version})' BOM을 삭제하시겠습니까?`)) return
    try {
      await deleteBom(bom.id)
      router.refresh()
    } catch (error) {
      console.error("삭제 실패:", error)
    }
  }

  const columns = getColumns({
    onEdit: handleEdit,
    onDelete: handleDelete,
  })

  const defaultValues: Partial<BOMFormValues> | undefined = editingBom
    ? {
        itemId: editingBom.itemId,
        version: editingBom.version,
        isDefault: editingBom.isDefault,
        status: editingBom.status as BOMStatus,
        bomItems: editingBom.bomItems.map((bi) => ({
          componentItemId: bi.componentItemId,
          seq: bi.seq,
          qtyPer: Number(bi.qtyPer),
          scrapRate: Number(bi.scrapRate),
        })),
      }
    : undefined

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditingBom(null)
            setFormMode("create")
            setFormOpen(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          BOM 등록
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={boms}
        searchableColumns={[{ id: "itemName" as keyof BOMWithDetails, title: "품목명" }]}
        filterableColumns={[
          {
            id: "itemType" as keyof BOMWithDetails,
            title: "품목유형",
            options: [
              { label: "반제품", value: "SEMI_FINISHED" },
              { label: "완제품", value: "FINISHED" },
            ],
          },
          {
            id: "status" as keyof BOMWithDetails,
            title: "상태",
            options: [
              { label: "초안", value: "DRAFT" },
              { label: "활성", value: "ACTIVE" },
              { label: "비활성", value: "INACTIVE" },
            ],
          },
        ]}
      />

      <BomFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        defaultValues={defaultValues}
        bomId={editingBom?.id}
        parentItems={parentItems}
        componentItems={componentItems}
        tenantId={tenantId}
      />
    </div>
  )
}
