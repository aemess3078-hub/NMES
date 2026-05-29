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
  PauseCircle,
  Wrench,
} from "lucide-react"

export const dynamic = "force-dynamic"

export default async function StatusMonitoringPage() {
  const [equipment, kpis] = await Promise.all([
    getEquipmentMonitorData(),
    getProductionKPIs(),
  ])

  // 상태별 집계 (서버에서 계산)
  const totalCount = equipment.length
  const activeCount = equipment.filter((e) => e.status === "ACTIVE").length
  const maintenanceCount = equipment.filter((e) => e.status === "MAINTENANCE").length
  const inactiveCount = equipment.filter((e) => e.status === "INACTIVE").length
  const alarmCount = equipment.filter(
    (e) => e.latestEvent?.eventType === "ALARM"
  ).length

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
          현황모니터링
        </h1>
        <p className="text-[15px] text-muted-foreground mt-1">
          설비별 가동 상태와 현재 작업 현황을 한눈에 파악합니다.
        </p>
      </div>

      {/* 설비 현황 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg shrink-0">
              <Cpu className="h-5 w-5 text-slate-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] text-muted-foreground">전체 설비</p>
              <p className="text-[22px] font-semibold leading-tight">
                {totalCount}
                <span className="text-[14px] font-normal text-muted-foreground ml-1">대</span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg shrink-0">
              <Activity className="h-5 w-5 text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] text-muted-foreground">가동중</p>
              <p className="text-[22px] font-semibold leading-tight text-green-700">
                {activeCount}
                <span className="text-[14px] font-normal text-muted-foreground ml-1">대</span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg shrink-0">
              <Wrench className="h-5 w-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] text-muted-foreground">점검/수리중</p>
              <p className="text-[22px] font-semibold leading-tight text-blue-700">
                {maintenanceCount}
                <span className="text-[14px] font-normal text-muted-foreground ml-1">대</span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-slate-50 rounded-lg shrink-0">
              <PauseCircle className="h-5 w-5 text-slate-500" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] text-muted-foreground">비가동</p>
              <p className="text-[22px] font-semibold leading-tight text-slate-600">
                {inactiveCount}
                <span className="text-[14px] font-normal text-muted-foreground ml-1">대</span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className={alarmCount > 0 ? "border-red-300" : ""}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg shrink-0 ${alarmCount > 0 ? "bg-red-50" : "bg-slate-50"}`}>
              <AlertTriangle className={`h-5 w-5 ${alarmCount > 0 ? "text-red-600" : "text-slate-400"}`} />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] text-muted-foreground">알람 발생</p>
              <p className={`text-[22px] font-semibold leading-tight ${alarmCount > 0 ? "text-red-600" : "text-slate-500"}`}>
                {alarmCount}
                <span className="text-[14px] font-normal text-muted-foreground ml-1">건</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 생산 KPI 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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
            <p className="text-[24px] font-semibold text-green-700">
              {kpis.todayGoodQty.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
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

      {/* 설비 현황 그리드 */}
      {equipment.length === 0 ? (
        <div className="rounded-lg border bg-card py-16 text-center">
          <Cpu className="mx-auto h-10 w-10 mb-3 text-muted-foreground/30" />
          <p className="text-[15px] text-muted-foreground">
            조회된 설비 현황 데이터가 없습니다.
          </p>
          <p className="text-[13px] text-muted-foreground mt-1">
            기준정보관리 &gt; 설비관리에서 설비를 등록하세요.
          </p>
        </div>
      ) : (
        <EquipmentMonitorGrid data={equipment} />
      )}
    </div>
  )
}
