export const dynamic = "force-dynamic"

import { getCodeGroups } from "@/lib/actions/common-code.actions"
import { CommonCodeManager } from "./common-code-manager"
import { cookies } from "next/headers"

export default async function CommonCodesPage() {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-a"
  const groups = await getCodeGroups()

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold leading-tight">공통코드 관리</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          시스템에서 사용하는 공통 코드를 관리합니다
        </p>
      </div>
      <CommonCodeManager groups={groups} tenantId={tenantId} />
    </div>
  )
}
