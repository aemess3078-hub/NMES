export const dynamic = "force-dynamic"

import { getTenantId } from "@/lib/auth"
import { getSitesSimple } from "@/lib/actions/site.actions"
import {
  getShipments,
  getShippableSalesOrders,
  getWarehouses,
} from "@/lib/actions/shipment.actions"
import { ShipmentDataTable } from "./shipment-data-table"

export default async function ShipmentsPage() {
  const tenantId = await getTenantId()
  const sites = await getSitesSimple()
  const siteId = sites[0]?.id ?? ""

  const [shipments, salesOrders, warehouses] = await Promise.all([
    getShipments(tenantId),
    getShippableSalesOrders(tenantId, siteId),
    getWarehouses(tenantId, siteId),
  ])

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold leading-tight">출하관리</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          수주 기반 출하를 등록하고 출하 현황을 추적합니다
        </p>
      </div>
      <ShipmentDataTable
        data={shipments as any}
        tenantId={tenantId}
        siteId={siteId}
        salesOrders={salesOrders as any}
        warehouses={warehouses}
      />
    </div>
  )
}
