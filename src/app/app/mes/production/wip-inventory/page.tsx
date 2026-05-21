import { cookies } from "next/headers"

import { getWipInventoryRows } from "@/lib/actions/work-order.actions"
import { WipInventoryDataTable } from "./wip-inventory-data-table"

export const dynamic = "force-dynamic"

export default async function WipInventoryPage() {
  // ── [PERF-TEMP] 성능 계측 임시 코드 — 측정 완료 후 제거 ──────────────────
  const _pt0 = Date.now()
  // ─────────────────────────────────────────────────────────────────────────
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"

  // ── [PERF-TEMP] ──────────────────────────────────────────────────────────
  const _t1 = Date.now()
  // ─────────────────────────────────────────────────────────────────────────
  const rows = await getWipInventoryRows(tenantId)
  // ── [PERF-TEMP] ──────────────────────────────────────────────────────────
  console.log(`[PERF] wipInventory.getWipInventoryRows ${Date.now() - _t1}ms  rows=${rows.length}`)
  console.log(`[PERF] wipInventory.page.total ${Date.now() - _pt0}ms`)
  // ─────────────────────────────────────────────────────────────────────────

  const totalOrders = new Set(rows.map((row) => row.workOrder.id)).size
  const inProgressCount = rows.filter((row) => isInProgress(row)).length
  const completedCount = rows.filter((row) => isCompleted(row)).length
  const delayedOrRemainingCount = rows.filter(
    (row) => hasRemaining(row) || isDelayed(row)
  ).length

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
          재공품재고
        </h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          MES &gt; 재고관리 · 재공수량은 WipUnit 기준, 공정잔량은 지시수량-완료수량 기준으로 조회합니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="총 작업지시" value={totalOrders.toLocaleString()} suffix="건" />
        <SummaryCard label="진행중 공정" value={inProgressCount.toLocaleString()} suffix="건" />
        <SummaryCard label="완료 공정" value={completedCount.toLocaleString()} suffix="건" />
        <SummaryCard
          label="지연/잔량 존재"
          value={delayedOrRemainingCount.toLocaleString()}
          suffix="건"
          accent
        />
      </div>

      <WipInventoryDataTable data={rows} />
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
          accent ? "text-amber-700" : "text-foreground"
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

type WipRow = Awaited<ReturnType<typeof getWipInventoryRows>>[number]

function isCompleted(row: WipRow) {
  return row.status === "COMPLETED" || row.remainingQty <= 0
}

function isInProgress(row: WipRow) {
  return row.status === "IN_PROGRESS" || (row.productionQty > 0 && row.remainingQty > 0)
}

function hasRemaining(row: WipRow) {
  return row.remainingQty > 0
}

function isDelayed(row: WipRow) {
  if (isCompleted(row) || !row.workOrder.dueDate) return false

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const dueDate = new Date(row.workOrder.dueDate)
  dueDate.setHours(0, 0, 0, 0)

  return dueDate < today
}
