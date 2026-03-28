import { cookies } from "next/headers"
import { isFeatureEnabled } from "@/lib/services/feature.service"
import { getInventoryBalances } from "@/lib/actions/inventory.actions"
import { InventoryDataTable } from "./inventory-data-table"

export const dynamic = "force-dynamic"

export default async function InventoryPage() {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"
  const enabled = await isFeatureEnabled(tenantId, "INVENTORY")

  if (!enabled) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">이 기능은 활성화되어 있지 않습니다.</p>
      </div>
    )
  }

  const balances = await getInventoryBalances()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
            재고현황
          </h1>
          <p className="text-[15px] text-muted-foreground mt-1">
            창고별 품목 재고현황을 조회합니다.
          </p>
        </div>
      </div>
      <InventoryDataTable data={balances} />
    </div>
  )
}
