import {
  getEquipmentMonitorData,
  getProductionKPIs,
} from "@/lib/actions/equipment-monitor.actions"
import { EquipmentMonitorGrid } from "./equipment-monitor-grid"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Gauge,
  Package,
  Wrench,
} from "lucide-react"

export const dynamic = "force-dynamic"

export default async function EquipmentMonitorPage() {
  const [equipment, kpis] = await Promise.all([
    getEquipmentMonitorData(),
    getProductionKPIs(),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
            설비 현황 모니터링
          </h1>
          <p className="text-[15px] text-muted-foreground mt-1">
            설비 가동 상태와 실시간 데이터를 한눈에 파악합니다.
          </p>
        </div>
        <a
          href="/kiosk"
          target="_blank"
          className="inline-flex items-center gap-2 text-[14px] text-primary hover:underline"
        >
          <Activity className="h-4 w-4" />
          스마트TV 현황판 열기
        </a>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-blue-600" />
              <p className="text-[13px] text-muted-foreground">진행 작업지시</p>
            </div>
            <p className="text-[24px] font-semibold">{kpis.activeWorkOrders}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-green-600" />
              <p className="text-[13px] text-muted-foreground">오늘 양품</p>
            </div>
            <p className="text-[24px] font-semibold text-green-700">{kpis.todayGoodQty.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <p className="text-[13px] text-muted-foreground">오늘 불량</p>
            </div>
            <p className="text-[24px] font-semibold text-red-700">{kpis.todayDefectQty.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Gauge className="h-4 w-4 text-orange-600" />
              <p className="text-[13px] text-muted-foreground">불량률</p>
            </div>
            <p className="text-[24px] font-semibold text-orange-700">{kpis.defectRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wrench className="h-4 w-4 text-yellow-600" />
              <p className="text-[13px] text-muted-foreground">수리 대기</p>
            </div>
            <p className="text-[24px] font-semibold text-yellow-700">{kpis.openRepairs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <p className="text-[13px] text-muted-foreground">설비 가동률</p>
            </div>
            <p className="text-[24px] font-semibold">{kpis.equipmentAvailability}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Equipment Grid */}
      <EquipmentMonitorGrid data={equipment} />
    </div>
  )
}
