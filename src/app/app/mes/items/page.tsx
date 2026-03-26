import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { getItems } from "@/lib/actions/item.actions"
import { ItemDataTable } from "./item-data-table"

export default async function ItemsPage() {
  const items = await getItems()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
            품목관리
          </h1>
          <p className="text-[15px] text-muted-foreground mt-1">
            원자재, 반제품, 완제품 품목을 관리합니다.
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          품목 등록
        </Button>
      </div>
      <ItemDataTable items={items} />
    </div>
  )
}
