import { cookies } from "next/headers"
import { isFeatureEnabled } from "@/lib/services/feature.service"
import {
  getInventoryTransactions,
  getWarehousesForTransaction,
  getItemsForInventory,
  getSitesForInventory,
} from "@/lib/actions/inventory.actions"
import { InventoryTransactionDataTable } from "./inventory-transaction-data-table"

export const dynamic = "force-dynamic"

export default async function InventoryTransactionsPage() {
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

  const [transactions, locations, items, sites] = await Promise.all([
    getInventoryTransactions(),
    getWarehousesForTransaction(),
    getItemsForInventory(),
    getSitesForInventory(),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
            입출고 관리
          </h1>
          <p className="text-[15px] text-muted-foreground mt-1">
            재고 입고, 출고, 이동, 조정 등의 트랜잭션 이력을 관리합니다.
          </p>
        </div>
      </div>
      <InventoryTransactionDataTable
        data={transactions}
        sites={sites}
        locations={locations}
        items={items}
        tenantId={tenantId}
      />
    </div>
  )
}
