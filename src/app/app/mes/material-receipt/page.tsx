export const dynamic = "force-dynamic"

import { cookies } from "next/headers"
import { getPurchaseOrders } from "@/lib/actions/purchase-order.actions"
import { MaterialReceiptDataTable } from "./material-receipt-data-table"

export default async function MaterialReceiptPage() {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"
  const siteId = cookieStore.get("siteId")?.value ?? "site-factory-001"

  const allOrders = await getPurchaseOrders(tenantId)

  // 입고 대기 발주만 필터링: ORDERED 또는 PARTIAL_RECEIVED
  const pendingOrders = allOrders.filter(
    (o) => o.status === "ORDERED" || o.status === "PARTIAL_RECEIVED"
  )

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold leading-tight">자재입고 관리</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          입고 대기 중인 발주를 확인하고 입고 처리합니다
        </p>
      </div>
      <MaterialReceiptDataTable
        data={pendingOrders as any}
        tenantId={tenantId}
        siteId={siteId}
      />
    </div>
  )
}
