export const dynamic = "force-dynamic"

import { getCatalogWithStatus } from "@/lib/actions/feature.actions"
import { FeatureCatalogClient } from "./feature-catalog-client"
import { cookies } from "next/headers"

export default async function FeaturesPage() {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"
  const catalog = await getCatalogWithStatus(tenantId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
            기능 관리
          </h1>
          <p className="text-[15px] text-muted-foreground mt-1">
            테넌트에서 사용할 기능을 선택합니다. 의존성이 있는 기능은 자동으로 활성화됩니다.
          </p>
        </div>
      </div>
      <FeatureCatalogClient catalog={catalog} tenantId={tenantId} />
    </div>
  )
}
