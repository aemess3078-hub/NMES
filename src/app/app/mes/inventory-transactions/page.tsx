import { getTenantId } from "@/lib/auth"
import { isFeatureEnabled } from "@/lib/services/feature.service"
import {
  getInventoryTransactions,
  getWarehousesForTransaction,
  getSitesForInventory,
} from "@/lib/actions/inventory.actions"
import { InventoryTransactionDataTable } from "./inventory-transaction-data-table"

export const dynamic = "force-dynamic"

export default async function InventoryTransactionsPage() {
  const tenantId = await getTenantId()
  const enabled = await isFeatureEnabled(tenantId, "INVENTORY")

  if (!enabled) {
    return (
      <div className="p-6">
        <p className="text-[15px] text-muted-foreground">
          재고 기능이 활성화되어 있지 않습니다.
        </p>
      </div>
    )
  }

  const [transactions, locations, sites] = await Promise.all([
    getInventoryTransactions(),
    getWarehousesForTransaction(),
    getSitesForInventory(),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
            원자재 입출고 이력
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            InventoryTransaction 기준으로 LOT 입고, 출고, 조정 이력과 제조번호 연결 상태를 확인합니다.
          </p>
        </div>
      </div>

      <InventoryTransactionDataTable
        data={transactions}
        sites={sites}
        locations={locations}
        tenantId={tenantId}
      />
    </div>
  )
}
