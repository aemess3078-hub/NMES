export const dynamic = "force-dynamic"

import { cookies } from "next/headers"
import { getProductionPlans, getSites, getItemsForPlan } from "@/lib/actions/production-plan.actions"
import { PlanDataTable } from "./plan-data-table"

export default async function ProductionPlanPage() {
  const [plans, sites, items] = await Promise.all([
    getProductionPlans(),
    getSites(),
    getItemsForPlan(),
  ])

  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-a"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
            생산계획 관리
          </h1>
          <p className="text-[15px] text-muted-foreground mt-1">
            생산계획을 등록하고 관리합니다.
          </p>
        </div>
      </div>
      <PlanDataTable
        data={plans}
        sites={sites}
        items={items}
        tenantId={tenantId}
      />
    </div>
  )
}
