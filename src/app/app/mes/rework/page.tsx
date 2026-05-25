export const dynamic = "force-dynamic"

import { cookies } from "next/headers"
import { getReworkPendingList } from "@/lib/actions/process-progress.actions"
import { ReworkDataTable } from "./rework-data-table"

export default async function ReworkPage() {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"

  const reworkItems = await getReworkPendingList(tenantId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
          재작업/보류 관리
        </h1>
        <p className="text-[15px] text-muted-foreground mt-1">
          미해결 REWORK WIP를 확인하고, 최종공정에서 발생한 수량만 복귀 또는 폐기로 종결합니다.
        </p>
      </div>

      {reworkItems.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-[15px] text-muted-foreground">
            현재 재작업 대기 중인 항목이 없습니다.
          </p>
        </div>
      ) : (
        <ReworkDataTable data={reworkItems} />
      )}
    </div>
  )
}
