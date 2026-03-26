"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import { getColumns } from "./columns"
import { ItemFormSheet } from "./item-form-sheet"
import { deleteItem, ItemWithCategory } from "@/lib/actions/item.actions"
import { ItemFormValues } from "./item-form-schema"

interface Category {
  id: string
  code: string
  name: string
}

interface ItemDataTableProps {
  items: ItemWithCategory[]
  categories: Category[]
  tenantId: string
}

export function ItemDataTable({ items, categories, tenantId }: ItemDataTableProps) {
  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [editingItem, setEditingItem] = useState<ItemWithCategory | null>(null)

  const handleEdit = (item: ItemWithCategory) => {
    setEditingItem(item)
    setFormMode("edit")
    setFormOpen(true)
  }

  const handleDelete = async (item: ItemWithCategory) => {
    if (!confirm(`'${item.name}' 품목을 삭제하시겠습니까?`)) return
    try {
      await deleteItem(item.id)
      router.refresh()
    } catch (error) {
      console.error("삭제 실패:", error)
    }
  }

  const columns = getColumns({
    onEdit: handleEdit,
    onDelete: handleDelete,
  })

  const defaultValues: Partial<ItemFormValues> | undefined = editingItem
    ? {
        code: editingItem.code,
        name: editingItem.name,
        itemType: editingItem.itemType,
        categoryId: editingItem.categoryId ?? null,
        uom: editingItem.uom,
        spec: editingItem.spec ?? null,
        isLotTracked: editingItem.isLotTracked,
        isSerialTracked: editingItem.isSerialTracked,
        status: editingItem.status,
      }
    : undefined

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setEditingItem(null)
            setFormMode("create")
            setFormOpen(true)
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          품목 등록
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={items}
        searchableColumns={[{ id: "name", title: "품목명" }]}
        filterableColumns={[
          {
            id: "itemType",
            title: "품목유형",
            options: [
              { label: "원자재", value: "RAW_MATERIAL" },
              { label: "반제품", value: "SEMI_FINISHED" },
              { label: "완제품", value: "FINISHED" },
              { label: "소모품", value: "CONSUMABLE" },
            ],
          },
          {
            id: "status",
            title: "상태",
            options: [
              { label: "활성", value: "ACTIVE" },
              { label: "비활성", value: "INACTIVE" },
              { label: "단종", value: "DISCONTINUED" },
            ],
          },
        ]}
      />

      <ItemFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        defaultValues={defaultValues}
        itemId={editingItem?.id}
        categories={categories}
        tenantId={tenantId}
      />
    </div>
  )
}
