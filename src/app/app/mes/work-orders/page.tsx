export const dynamic = "force-dynamic"

import { cookies } from "next/headers"
import { getWorkOrders, getSites, getItemsForWorkOrder, getEquipments } from "@/lib/actions/work-order.actions"
import { WorkOrderDataTable } from "./work-order-data-table"
import { isFeatureEnabled } from "@/lib/services/feature.service"

export default async function WorkOrdersPage() {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"
  const enabled = await isFeatureEnabled(tenantId, "WORK_ORDER")

  if (!enabled) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">이 기능은 활성화되어 있지 않습니다.</p>
      </div>
    )
  }

  const [workOrders, sites, items, equipments] = await Promise.all([
    getWorkOrders(),
    getSites(),
    getItemsForWorkOrder(),
    getEquipments(),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
            작업지시 관리
          </h1>
          <p className="text-[15px] text-muted-foreground mt-1">
            작업지시를 등록하고 공정별 진행 상태를 관리합니다.
          </p>
        </div>
      </div>
      <WorkOrderDataTable
        data={workOrders}
        sites={sites}
        items={items}
        equipments={equipments}
        tenantId={tenantId}
      />
    </div>
  )
}
