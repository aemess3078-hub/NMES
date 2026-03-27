export const dynamic = "force-dynamic"

import { isFeatureEnabled } from "@/lib/services/feature.service"
import { cookies } from "next/headers"

export default async function RoutingPage() {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"
  const enabled = await isFeatureEnabled(tenantId, "ROUTING")

  if (!enabled) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">이 기능은 활성화되어 있지 않습니다.</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-[26px] font-semibold text-foreground">공정/라우팅 관리</h1>
      <p className="mt-2 text-[15px] text-muted-foreground">준비 중입니다.</p>
    </div>
  );
}
