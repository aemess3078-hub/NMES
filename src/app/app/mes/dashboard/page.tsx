import { getProductionKPIs } from "@/lib/actions/equipment-monitor.actions"
import { prisma } from "@/lib/db/prisma"
import { getTenantId } from "@/lib/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Gauge,
  Package,
  Wrench,
  ClipboardCheck,
  TrendingUp,
} from "lucide-react"
import Link from "next/link"

export const dynamic = "force-dynamic"

async function getExtendedKPIs() {
  // ── [PERF-TEMP] 성능 계측 임시 코드 — 측정 완료 후 제거 ──────────────────
  const _t0 = Date.now()
  // ─────────────────────────────────────────────────────────────────────────
  const tenantId = await getTenantId()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // ── [PERF-TEMP] ──────────────────────────────────────────────────────────
  const _t1 = Date.now()
  console.log(`[PERF] dashboard.getTenantId ${_t1 - _t0}ms`)
  // ─────────────────────────────────────────────────────────────────────────
  const [kpis, inspectionsToday, openRepairs, defectRate30d] = await Promise.all([
    getProductionKPIs(),
    prisma.qualityInspection.count({
      where: { workOrderOperation: { workOrder: { tenantId } }, inspectedAt: { gte: today } },
    }),
    prisma.equipmentRepairRequest.findMany({
      where: { tenantId, status: { in: ["OPEN", "IN_PROGRESS"] }, priority: { in: ["HIGH", "CRITICAL"] } },
      select: { id: true, title: true, equipment: { select: { name: true } }, priority: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    (async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const [good, defect] = await Promise.all([
        prisma.productionResult.aggregate({
          where: { workOrderOperation: { workOrder: { tenantId } }, endedAt: { gte: thirtyDaysAgo } },
          _sum: { goodQty: true },
        }),
        prisma.productionResult.aggregate({
          where: { workOrderOperation: { workOrder: { tenantId } }, endedAt: { gte: thirtyDaysAgo } },
          _sum: { defectQty: true },
        }),
      ])
      const g = Number(good._sum?.goodQty ?? 0)
      const d = Number(defect._sum?.defectQty ?? 0)
      return g + d > 0 ? ((d / (g + d)) * 100).toFixed(2) : "0.00"
    })(),
  ])
  // ── [PERF-TEMP] ──────────────────────────────────────────────────────────
  console.log(`[PERF] dashboard.parallelQueries(kpis+inspect+repairs+defect30d) ${Date.now() - _t1}ms`)
  console.log(`[PERF] dashboard.getExtendedKPIs.total ${Date.now() - _t0}ms`)
  // ─────────────────────────────────────────────────────────────────────────

  return { kpis, inspectionsToday, openRepairs, defectRate30d }
}

export default async function DashboardPage() {
  // ── [PERF-TEMP] 성능 계측 임시 코드 — 측정 완료 후 제거 ──────────────────
  const _pt0 = Date.now()
  // ─────────────────────────────────────────────────────────────────────────
  const { kpis, inspectionsToday, openRepairs, defectRate30d } = await getExtendedKPIs()
  // ── [PERF-TEMP] ──────────────────────────────────────────────────────────
  console.log(`[PERF] dashboard.page.total ${Date.now() - _pt0}ms`)
  // ─────────────────────────────────────────────────────────────────────────

  const PRIORITY_COLOR: Record<string, string> = {
    CRITICAL: "text-red-600",
    HIGH: "text-orange-600",
    MEDIUM: "text-yellow-600",
    LOW: "text-slate-500",
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
            생산현황 대시보드
          </h1>
          <p className="text-[15px] text-muted-foreground mt-1">
            오늘의 주요 생산·품질·설비 지표를 한눈에 확인합니다.
          </p>
        </div>
        <Link
          href="/kiosk"
          target="_blank"
          className="inline-flex items-center gap-2 text-[14px] px-4 py-2 rounded-lg border hover:bg-muted transition-colors"
        >
          <Activity className="h-4 w-4" />
          스마트TV 현황판
        </Link>
      </div>

      {/* Main KPI Grid */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Activity className="h-4 w-4 text-blue-600" />
              </div>
              <p className="text-[14px] text-muted-foreground">진행 작업지시</p>
            </div>
            <p className="text-[32px] font-bold">{kpis.activeWorkOrders}</p>
            <p className="text-[13px] text-muted-foreground mt-1">건 진행 중</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-green-50 rounded-lg">
                <Package className="h-4 w-4 text-green-600" />
              </div>
              <p className="text-[14px] text-muted-foreground">오늘 양품 생산</p>
            </div>
            <p className="text-[32px] font-bold text-green-700">{kpis.todayGoodQty.toLocaleString()}</p>
            <p className="text-[13px] text-muted-foreground mt-1">ea</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-orange-50 rounded-lg">
                <Gauge className="h-4 w-4 text-orange-600" />
              </div>
              <p className="text-[14px] text-muted-foreground">불량률 (오늘)</p>
            </div>
            <p className={`text-[32px] font-bold ${Number(kpis.defectRate) > 3 ? "text-red-600" : "text-foreground"}`}>
              {kpis.defectRate}%
            </p>
            <p className="text-[13px] text-muted-foreground mt-1">30일 평균: {defectRate30d}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-emerald-50 rounded-lg">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="text-[14px] text-muted-foreground">설비 가동률</p>
            </div>
            <p className="text-[32px] font-bold text-emerald-700">{kpis.equipmentAvailability}%</p>
            <p className="text-[13px] text-muted-foreground mt-1">설비 가동 현황</p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-red-50 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
              <p className="text-[14px] text-muted-foreground">오늘 불량 수량</p>
            </div>
            <p className="text-[28px] font-bold text-red-600">{kpis.todayDefectQty.toLocaleString()}</p>
            <p className="text-[13px] text-muted-foreground mt-1">ea</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-purple-50 rounded-lg">
                <ClipboardCheck className="h-4 w-4 text-purple-600" />
              </div>
              <p className="text-[14px] text-muted-foreground">오늘 검사 건수</p>
            </div>
            <p className="text-[28px] font-bold">{inspectionsToday}</p>
            <p className="text-[13px] text-muted-foreground mt-1">건 검사 완료</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-yellow-50 rounded-lg">
                <Wrench className="h-4 w-4 text-yellow-600" />
              </div>
              <p className="text-[14px] text-muted-foreground">수리 대기</p>
            </div>
            <p className="text-[28px] font-bold text-yellow-700">{kpis.openRepairs}</p>
            <p className="text-[13px] text-muted-foreground mt-1">건 미완료</p>
          </CardContent>
        </Card>
      </div>

      {/* Priority Repairs */}
      {openRepairs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-[18px] flex items-center gap-2">
              <Wrench className="h-4 w-4 text-red-600" />
              긴급/우선 수리 요청
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {openRepairs.map((repair) => (
                <div
                  key={repair.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40"
                >
                  <div>
                    <p className="text-[14px] font-medium">{repair.title}</p>
                    <p className="text-[13px] text-muted-foreground">{repair.equipment.name}</p>
                  </div>
                  <span className={`text-[13px] font-semibold ${PRIORITY_COLOR[repair.priority]}`}>
                    {repair.priority === "CRITICAL" ? "긴급" : "높음"}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <Link href="/app/mes/equipment-repair" className="text-[13px] text-primary hover:underline">
                수리요청 전체 보기 →
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { href: "/app/mes/equipment-monitor", label: "설비 모니터링", icon: Activity },
          { href: "/app/mes/inspection-stages", label: "초·중·종 검사", icon: ClipboardCheck },
          { href: "/app/mes/equipment-repair", label: "수리요청 관리", icon: Wrench },
          { href: "/app/mes/work-orders", label: "작업지시", icon: Package },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
          >
            <link.icon className="h-5 w-5 text-muted-foreground" />
            <span className="text-[14px] font-medium">{link.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
