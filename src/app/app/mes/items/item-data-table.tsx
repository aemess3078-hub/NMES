"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import { getColumns } from "./columns"
import { ItemFormSheet } from "./item-form-sheet"
import { deleteItem, type ItemWithDetails, type WarehouseForItemForm } from "@/lib/actions/item.actions"
import { type ItemFormValues } from "./item-form-schema"
import { useUserRole } from "@/lib/contexts/user-role-context"

type Category = {
  id:       string
  code:     string
  name:     string
  itemType: string | null
}

type ItemGroupOption = {
  id:         string
  code:       string
  name:       string
  categoryId: string
}

interface ItemDataTableProps {
  items:      ItemWithDetails[]
  categories: Category[]
  itemGroups: ItemGroupOption[]
  warehouses: WarehouseForItemForm[]
  tenantId:   string
}

export function ItemDataTable({ items, categories, itemGroups, warehouses, tenantId }: ItemDataTableProps) {
  const router     = useRouter()
  const canMutate  = useUserRole() !== "VIEWER"
  const [formOpen,     setFormOpen]     = useState(false)
  const [formMode,     setFormMode]     = useState<"create" | "edit">("create")
  const [editingItem,  setEditingItem]  = useState<ItemWithDetails | null>(null)

  const handleEdit = (item: ItemWithDetails) => {
    setEditingItem(item)
    setFormMode("edit")
    setFormOpen(true)
  }

  const handleDelete = async (item: ItemWithDetails) => {
    if (!confirm(`'${item.name}' 품목을 삭제하시겠습니까?`)) return
    try {
      await deleteItem(item.id)
      router.refresh()
    } catch (error) {
      console.error("삭제 실패:", error)
    }
  }

  const allColumns = getColumns({ onEdit: handleEdit, onDelete: handleDelete })
  const columns    = canMutate ? allColumns : allColumns.filter((c) => c.id !== "actions")

  const defaultValues: Partial<ItemFormValues> | undefined = editingItem
    ? {
        code:            editingItem.code,
        name:            editingItem.name,
        categoryId:      editingItem.categoryId ?? "",
        itemGroupId:     editingItem.itemGroupId ?? null,
        uom:             editingItem.uom,
        spec:            editingItem.spec ?? null,
        isLotTracked:    editingItem.isLotTracked,
        isSerialTracked: editingItem.isSerialTracked,
        status:          editingItem.status,
        defaultWarehouseId: editingItem.defaultWarehouseId ?? null,
      }
    : undefined

  return (
    <div className="space-y-4">
      {canMutate && (
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
      )}

      <DataTable
        columns={columns}
        data={items}
        searchableColumns={[{ id: "name", title: "품목명" }]}
        filterableColumns={[
          {
            id:    "itemType",
            title: "시스템 유형",
            options: [
              { label: "원자재", value: "RAW_MATERIAL" },
              { label: "반제품", value: "SEMI_FINISHED" },
              { label: "완제품", value: "FINISHED" },
              { label: "소모품", value: "CONSUMABLE" },
            ],
          },
          {
            id:    "status",
            title: "상태",
            options: [
              { label: "활성",  value: "ACTIVE" },
              { label: "비활성", value: "INACTIVE" },
              { label: "단종",  value: "DISCONTINUED" },
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
        itemGroups={itemGroups}
        warehouses={warehouses}
        tenantId={tenantId}
      />
    </div>
  )
}
