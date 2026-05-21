import { cookies } from "next/headers"
import { SalesOrderStatus } from "@prisma/client"

import { getSalesOrderStatusRows } from "@/lib/actions/sales-order.actions"
import { OrderStatusDataTable } from "./order-status-data-table"

export const dynamic = "force-dynamic"

const OPEN_STATUSES: SalesOrderStatus[] = [
  "DRAFT",
  "CONFIRMED",
  "IN_PRODUCTION",
  "PARTIAL_SHIPPED",
]

export default async function SalesOrderStatusPage() {
  // ── [PERF-TEMP] 성능 계측 임시 코드 — 측정 완료 후 제거 ──────────────────
  const _pt0 = Date.now()
  // ─────────────────────────────────────────────────────────────────────────
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"

  // ── [PERF-TEMP] ──────────────────────────────────────────────────────────
  const _t1 = Date.now()
  // ─────────────────────────────────────────────────────────────────────────
  const orders = await getSalesOrderStatusRows(tenantId)
  // ── [PERF-TEMP] ──────────────────────────────────────────────────────────
  console.log(`[PERF] salesOrderStatus.getSalesOrderStatusRows ${Date.now() - _t1}ms  rows=${orders.length}`)
  console.log(`[PERF] salesOrderStatus.page.total ${Date.now() - _pt0}ms`)
  // ─────────────────────────────────────────────────────────────────────────
  const today = startOfLocalDay(new Date())

  const totalOrders = orders.length
  const inProgressOrders = orders.filter((order) =>
    OPEN_STATUSES.includes(order.status)
  ).length
  const completedOrders = orders.filter((order) =>
    ["SHIPPED", "CLOSED"].includes(order.status)
  ).length
  const urgentOrOverdueOrders = orders.filter((order) => {
    if (!OPEN_STATUSES.includes(order.status)) return false
    const dueDate = startOfLocalDay(order.deliveryDate)
    const daysUntilDue = Math.ceil(
      (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    )
    return daysUntilDue <= 7
  }).length

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
          수주현황
        </h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          MES &gt; 영업관리 · 수주별 납기, 출하 진행률, 미출하 수량을 조회합니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="총 수주 건수" value={totalOrders.toLocaleString()} suffix="건" />
        <SummaryCard label="진행중 수주" value={inProgressOrders.toLocaleString()} suffix="건" />
        <SummaryCard label="완료 수주" value={completedOrders.toLocaleString()} suffix="건" />
        <SummaryCard
          label="납기 임박/지연"
          value={urgentOrOverdueOrders.toLocaleString()}
          suffix="건"
          accent
        />
      </div>

      <OrderStatusDataTable data={orders} />
    </div>
  )
}

function SummaryCard({
  label,
  value,
  suffix,
  accent,
}: {
  label: string
  value: string
  suffix?: string
  accent?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-[20px] font-semibold tabular-nums ${
          accent ? "text-red-600" : "text-foreground"
        }`}
      >
        {value}
        {suffix ? (
          <span className="ml-1 text-[14px] font-normal text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </p>
    </div>
  )
}

function startOfLocalDay(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}
