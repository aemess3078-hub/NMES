export const dynamic = "force-dynamic"

import { cookies } from "next/headers"
import { getPlansForMRP } from "@/lib/actions/mrp.actions"
import { MrpDashboard } from "./mrp-dashboard"

export default async function MRPPage() {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"
  const siteId = cookieStore.get("siteId")?.value ?? "site-a"

  const plans = await getPlansForMRP()

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold leading-tight">MRP 자재소요량</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          생산계획 기반 BOM 전개 → 자재 소요량 계산 → AI 발주 제안
        </p>
      </div>
      <MrpDashboard plans={plans as any} tenantId={tenantId} siteId={siteId} />
    </div>
  )
}
