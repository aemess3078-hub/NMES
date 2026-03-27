import { cookies } from "next/headers"
import { isFeatureEnabled } from "@/lib/services/feature.service"
import { getLotRules, getItemsForLot } from "@/lib/actions/lot.actions"
import { LotRuleDataTable } from "./lot-rule-data-table"

export const dynamic = "force-dynamic"

export default async function LotRulesPage() {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"

  const enabled = await isFeatureEnabled(tenantId, "LOT_TRACKING")
  if (!enabled) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          LOT 추적 기능이 활성화되어 있지 않습니다. 기능 관리 페이지에서 LOT_TRACKING을 활성화하세요.
        </p>
      </div>
    )
  }

  const [rules, items] = await Promise.all([
    getLotRules(),
    getItemsForLot(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
          LOT 규칙 관리
        </h1>
        <p className="text-[15px] text-muted-foreground mt-1">
          품목별 LOT 번호 자동 생성 규칙을 설정합니다.
        </p>
      </div>

      <LotRuleDataTable
        data={rules as any}
        items={items}
        tenantId={tenantId}
      />
    </div>
  )
}
