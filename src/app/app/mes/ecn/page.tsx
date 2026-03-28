import { cookies } from "next/headers"
import { getECNs, getItemsForECN } from "@/lib/actions/ecn.actions"
import { ECNDataTable } from "./ecn-data-table"

export const dynamic = "force-dynamic"

export default async function ECNPage() {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"
  const userId = cookieStore.get("profileId")?.value ?? "profile-manager-001"

  const [ecns, items] = await Promise.all([
    getECNs(),
    getItemsForECN(),
  ])

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-[26px] font-bold">변경관리 (ECN/ECO)</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          BOM·라우팅 변경 요청, 승인, 적용을 관리합니다.
        </p>
      </div>
      <ECNDataTable ecns={ecns} items={items} tenantId={tenantId} userId={userId} />
    </div>
  )
}
