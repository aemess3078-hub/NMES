"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Plus } from "lucide-react"
import { DataTable } from "@/components/common/data-table"
import { getColumns } from "./columns"
import { ItemCategoryFormSheet } from "./item-category-form-sheet"
import {
  deleteItemCategory,
  type ItemCategoryWithCounts,
} from "@/lib/actions/item-category.actions"
import { useUserRole } from "@/lib/contexts/user-role-context"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const DELETE_ERRORS: Record<string, string> = {
  HAS_ITEMS:  "사용 중인 품목분류는 삭제할 수 없습니다.",
  HAS_GROUPS: "품목군이 연결된 품목분류는 삭제할 수 없습니다.",
  NOT_FOUND:  "품목분류를 찾을 수 없습니다.",
  FORBIDDEN:  "권한이 없습니다.",
}

interface Props {
  data: ItemCategoryWithCounts[]
}

export function ItemCategoryDataTable({ data }: Props) {
  const router     = useRouter()
  const canMutate  = useUserRole() !== "VIEWER"

  const [keyword,    setKeyword]    = useState("")
  const [sheetOpen,  setSheetOpen]  = useState(false)
  const [editTarget, setEditTarget] = useState<ItemCategoryWithCounts | null>(null)

  const filteredData = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return data
    return data.filter((c) =>
      [c.code, c.name].join(" ").toLowerCase().includes(kw)
    )
  }, [data, keyword])

  const handleEdit = (cat: ItemCategoryWithCounts) => {
    setEditTarget(cat)
    setSheetOpen(true)
  }

  const handleDelete = async (cat: ItemCategoryWithCounts) => {
    if (!confirm(`"${cat.name}" 품목분류를 삭제하시겠습니까?`)) return
    try {
      await deleteItemCategory(cat.id)
      router.refresh()
    } catch (e: unknown) {
      const key = e instanceof Error ? e.message : ""
      alert(DELETE_ERRORS[key] ?? (e instanceof Error ? e.message : "삭제 중 오류가 발생했습니다."))
    }
  }

  const allColumns = getColumns({ onEdit: handleEdit, onDelete: handleDelete })
  const columns    = canMutate ? allColumns : allColumns.filter((c) => c.id !== "actions")

  return (
    <div className="space-y-4">
      {/* 툴바 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="코드 / 품목분류명 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="h-9 w-[260px] pl-9 text-[14px]"
          />
        </div>

        {canMutate && (
          <Button
            size="sm"
            onClick={() => { setEditTarget(null); setSheetOpen(true) }}
          >
            <Plus className="h-4 w-4 mr-2" />
            품목분류 등록
          </Button>
        )}
      </div>

      <DataTable columns={columns} data={filteredData} />

      <ItemCategoryFormSheet
        mode={editTarget ? "edit" : "create"}
        category={editTarget}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open)
          if (!open) setEditTarget(null)
        }}
      />
    </div>
  )
}
