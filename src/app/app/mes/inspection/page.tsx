import { cookies } from "next/headers"
import {
  getQualityInspections,
  getWorkOrderOperationsForInspection,
  getProfilesForInspection,
  getDefectCodes,
} from "@/lib/actions/quality.actions"
import { InspectionDataTable } from "./inspection-data-table"

export const dynamic = "force-dynamic"

export default async function InspectionPage() {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"

  const [inspections, workOrderOperations, profiles, defectCodes] = await Promise.all([
    getQualityInspections(tenantId),
    getWorkOrderOperationsForInspection(tenantId),
    getProfilesForInspection(),
    getDefectCodes(tenantId),
  ])

  const profileOptions = profiles.map((p) => ({
    id: p.id,
    displayName: p.name,
    email: p.email,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
            공정검사
          </h1>
          <p className="text-[15px] text-muted-foreground mt-1">
            작업지시 공정별 품질검사를 등록하고 판정합니다.
          </p>
        </div>
      </div>

      <InspectionDataTable
        data={inspections}
        tenantId={tenantId}
        workOrderOperations={workOrderOperations}
        profiles={profileOptions}
        defectCodes={defectCodes}
      />
    </div>
  )
}
