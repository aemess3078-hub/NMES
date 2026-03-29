import { cookies } from "next/headers"
import { getNumberingRules, getCodeGroupsForBuilder } from "@/lib/actions/numbering-rule.actions"
import { NumberingRuleBuilder } from "./numbering-rule-builder"
import type { Token } from "@/lib/types/numbering-rule"

export const dynamic = "force-dynamic"

export default async function NumberingRulesPage() {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"

  const [rules, codeGroups] = await Promise.all([
    getNumberingRules(tenantId),
    getCodeGroupsForBuilder(tenantId),
  ])

  const lotTokens: Token[] = rules.LOT ? (rules.LOT.tokens as Token[]) : []
  const serialTokens: Token[] = rules.SERIAL ? (rules.SERIAL.tokens as Token[]) : []

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight">번호 규칙 관리</h1>
        <p className="text-[15px] text-muted-foreground mt-1">
          LOT 및 시리얼 번호의 자동 생성 규칙을 설정합니다.
        </p>
      </div>

      <div className="space-y-8">
        <NumberingRuleBuilder
          type="LOT"
          label="LOT 번호 규칙"
          initialTokens={lotTokens}
          tenantId={tenantId}
          codeGroups={codeGroups}
        />
        <div className="border-t" />
        <NumberingRuleBuilder
          type="SERIAL"
          label="시리얼 번호 규칙"
          initialTokens={serialTokens}
          tenantId={tenantId}
          codeGroups={codeGroups}
        />
      </div>
    </div>
  )
}
