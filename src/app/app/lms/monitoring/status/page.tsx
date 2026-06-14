import { getEquipmentMonitorData } from "@/lib/actions/equipment-monitor.actions"
import { RealtimeMonitorClient } from "./realtime-monitor-client"
import { Cpu } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function StatusMonitoringPage() {
  const equipment = await getEquipmentMonitorData()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
          현황 모니터링
        </h1>
        <p className="text-[15px] text-muted-foreground mt-1">
          설비 가동 상태를 실시간으로 관제합니다.
        </p>
      </div>

      {equipment.length === 0 ? (
        <div className="rounded-lg border bg-card py-16 text-center">
          <Cpu className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-[15px] text-muted-foreground">조회할 설비 데이터가 없습니다.</p>
        </div>
      ) : (
        <RealtimeMonitorClient data={equipment} />
      )}
    </div>
  )
}
