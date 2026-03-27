import { getBoms, getItemsForBom, getComponentItems } from "@/lib/actions/bom.actions"
import { BomDataTable } from "./bom-data-table"

export const dynamic = "force-dynamic"

export default async function BomPage() {
  const [boms, parentItems, componentItems] = await Promise.all([
    getBoms(),
    getItemsForBom(),
    getComponentItems(),
  ])

  const resolvedTenantId = boms[0]?.tenantId ?? ""

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
            BOM 관리
          </h1>
          <p className="text-[15px] text-muted-foreground mt-1">
            품목별 자재 명세(Bill of Materials)를 관리합니다.
          </p>
        </div>
      </div>
      <BomDataTable
        boms={boms}
        parentItems={parentItems}
        componentItems={componentItems}
        tenantId={resolvedTenantId}
      />
    </div>
  )
}
