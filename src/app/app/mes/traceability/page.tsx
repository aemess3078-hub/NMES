import { cookies } from "next/headers"
import { isFeatureEnabled } from "@/lib/services/feature.service"
import { TraceabilityClient } from "./traceability-client"

export const dynamic = "force-dynamic"

interface TraceabilityPageProps {
  searchParams: Promise<{ lotId?: string }>
}

export default async function TraceabilityPage({ searchParams }: TraceabilityPageProps) {
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

  const params = await searchParams
  const initialLotId = params.lotId

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
          LOT Traceability
        </h1>
        <p className="text-[15px] text-muted-foreground mt-1">
          LOT 번호로 원자재부터 완제품까지 정/역추적합니다.
        </p>
      </div>

      <TraceabilityClient
        initialLotId={initialLotId}
        tenantId={tenantId}
      />
    </div>
  )
}
