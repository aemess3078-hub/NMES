import {
  getEquipmentMonitorData,
  getProductionKPIs,
} from "@/lib/actions/equipment-monitor.actions"
import { EquipmentMonitorGrid } from "@/app/app/mes/equipment-monitor/equipment-monitor-grid"
import { Card, CardContent } from "@/components/ui/card"
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Cpu,
  Gauge,
  Package,
  Wrench,
} from "lucide-react"

export const dynamic = "force-dynamic"

export default async function StatusMonitoringPage() {
  const [equipment, kpis] = await Promise.all([
    getEquipmentMonitorData(),
    getProductionKPIs(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
          현황 모니터링
        </h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          설비 가동 상태와 생산 KPI를 확인합니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-600" />
              <p className="text-[13px] text-muted-foreground">진행 작업</p>
            </div>
            <p className="text-[24px] font-semibold">{kpis.activeWorkOrders}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <Package className="h-4 w-4 text-green-600" />
              <p className="text-[13px] text-muted-foreground">오늘 양품</p>
            </div>
            <p className="text-[24px] font-semibold text-green-700">
              {kpis.todayGoodQty.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <p className="text-[13px] text-muted-foreground">오늘 불량</p>
            </div>
            <p className="text-[24px] font-semibold text-red-700">
              {kpis.todayDefectQty.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-orange-600" />
              <p className="text-[13px] text-muted-foreground">불량률</p>
            </div>
            <p className="text-[24px] font-semibold text-orange-700">
              {kpis.defectRate}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <Wrench className="h-4 w-4 text-yellow-600" />
              <p className="text-[13px] text-muted-foreground">수리 대기</p>
            </div>
            <p className="text-[24px] font-semibold text-yellow-700">
              {kpis.openRepairs}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <p className="text-[13px] text-muted-foreground">설비 가동률</p>
            </div>
            <p className="text-[24px] font-semibold">
              {kpis.equipmentAvailability}%
            </p>
          </CardContent>
        </Card>
      </div>

      {equipment.length === 0 ? (
        <div className="rounded-lg border bg-card py-16 text-center">
          <Cpu className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-[15px] text-muted-foreground">
            조회할 설비 현황 데이터가 없습니다.
          </p>
        </div>
      ) : (
        <EquipmentMonitorGrid data={equipment} />
      )}
    </div>
  )
}
