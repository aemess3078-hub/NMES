import { cookies } from "next/headers"
import {
  getTags,
  getConnectionsForTag,
} from "@/lib/actions/equipment-integration.actions"
import { TagDataTable } from "./tag-data-table"

export const dynamic = "force-dynamic"

export default async function TagsPage() {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"

  const [tags, connections] = await Promise.all([
    getTags(tenantId),
    getConnectionsForTag(tenantId),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
            태그 사전
          </h1>
          <p className="text-[15px] text-muted-foreground mt-1">
            설비 연결에서 수집할 데이터 태그를 정의하고 관리합니다.
          </p>
        </div>
      </div>

      <TagDataTable data={tags} connections={connections} />
    </div>
  )
}
