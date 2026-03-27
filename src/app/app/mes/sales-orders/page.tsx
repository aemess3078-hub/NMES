export const dynamic = "force-dynamic"

import { cookies } from "next/headers"
import { getSalesOrders, getCustomers, getItemsForSales } from "@/lib/actions/sales-order.actions"
import { SalesOrderDataTable } from "./sales-order-data-table"

export default async function SalesOrdersPage() {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"
  const siteId = cookieStore.get("siteId")?.value ?? "site-factory-001"

  const [orders, customers, items] = await Promise.all([
    getSalesOrders(tenantId),
    getCustomers(tenantId),
    getItemsForSales(tenantId),
  ])

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold leading-tight">수주관리</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          고객 수주를 접수하고 납기일을 관리합니다
        </p>
      </div>
      <SalesOrderDataTable
        data={orders as any}
        tenantId={tenantId}
        siteId={siteId}
        customers={customers}
        items={items}
      />
    </div>
  )
}
