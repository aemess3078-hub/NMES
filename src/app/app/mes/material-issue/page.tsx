export const dynamic = "force-dynamic"

import { cookies } from "next/headers"
import {
  getWorkOrdersForIssue,
  getWarehousesWithStock,
} from "@/lib/actions/material-issue.actions"
import { MaterialIssueTable } from "./material-issue-table"

export default async function MaterialIssuePage() {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"

  const workOrders = await getWorkOrdersForIssue(tenantId)

  // 필요 품목 ID 수집 → 창고별 재고 조회
  const itemIdSet = new Set(workOrders.flatMap((wo) => wo.materials.map((m) => m.itemId)))
  const itemIds = Array.from(itemIdSet)
  const warehouses = await getWarehousesWithStock(tenantId, itemIds)

  const pendingCount = workOrders.filter((wo) => !wo.allIssued).length
  const completedCount = workOrders.filter((wo) => wo.allIssued).length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
            자재출고 관리
          </h1>
          <p className="text-[15px] text-muted-foreground mt-1">
            작업지시별 BOM 자재를 창고에서 출고하여 생산에 투입합니다.
          </p>
        </div>
        {(pendingCount > 0 || completedCount > 0) && (
          <div className="flex gap-3">
            {pendingCount > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-center">
                <div className="font-semibold text-amber-800 text-[18px]">{pendingCount}</div>
                <div className="text-[13px] text-amber-700">출고 대기</div>
              </div>
            )}
            {completedCount > 0 && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-center">
                <div className="font-semibold text-green-700 text-[18px]">{completedCount}</div>
                <div className="text-[13px] text-green-600">출고 완료</div>
              </div>
            )}
          </div>
        )}
      </div>

      <MaterialIssueTable
        data={workOrders}
        warehouses={warehouses}
        tenantId={tenantId}
      />
    </div>
  )
}
