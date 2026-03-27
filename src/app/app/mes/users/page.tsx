export const dynamic = "force-dynamic"

import { getPermissionMatrix } from "@/lib/actions/permission.actions"
import { PermissionMatrixTable } from "./permission-matrix"
import { cookies } from "next/headers"
import { isFeatureEnabled } from "@/lib/services/feature.service"

export default async function UsersPage() {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"
  const enabled = await isFeatureEnabled(tenantId, "PERMISSION")

  if (!enabled) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">이 기능은 활성화되어 있지 않습니다.</p>
      </div>
    )
  }

  const matrix = await getPermissionMatrix(tenantId)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold leading-tight">권한 관리</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          역할별 리소스 접근 권한을 관리합니다
        </p>
      </div>
      <PermissionMatrixTable matrix={matrix} tenantId={tenantId} />
    </div>
  )
}
