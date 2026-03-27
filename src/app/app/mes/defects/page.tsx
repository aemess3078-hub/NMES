import { cookies } from "next/headers"
import { getDefectCodes } from "@/lib/actions/quality.actions"
import { DefectDataTable } from "./defect-data-table"

export const dynamic = "force-dynamic"

export default async function DefectsPage() {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"

  const defectCodes = await getDefectCodes(tenantId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
            불량코드 관리
          </h1>
          <p className="text-[15px] text-muted-foreground mt-1">
            불량 유형별 코드를 등록하고 관리합니다.
          </p>
        </div>
      </div>

      <DefectDataTable data={defectCodes} tenantId={tenantId} />
    </div>
  )
}
