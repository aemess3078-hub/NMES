import {
  getMaterialInventoryBalances,
  getSitesForInventory,
} from "@/lib/actions/inventory.actions"
import { MaterialStockDataTable } from "./material-stock-data-table"

export const dynamic = "force-dynamic"

export default async function MaterialStockPage() {
  // ── [PERF-TEMP] 성능 계측 임시 코드 — 측정 완료 후 제거 ──────────────────
  const _pt0 = Date.now()
  // ─────────────────────────────────────────────────────────────────────────
  const [balances, sites] = await Promise.all([
    getMaterialInventoryBalances(),
    getSitesForInventory(),
  ])
  // ── [PERF-TEMP] ──────────────────────────────────────────────────────────
  console.log(`[PERF] materialStock.parallelQueries(balances+sites) ${Date.now() - _pt0}ms  balanceRows=${balances.length}`)
  console.log(`[PERF] materialStock.page.total ${Date.now() - _pt0}ms`)
  // ─────────────────────────────────────────────────────────────────────────

  const totalLines = balances.length
  const totalOnHand = balances.reduce((sum, b) => sum + Number(b.qtyOnHand), 0)
  const totalAvailable = balances.reduce((sum, b) => sum + Number(b.qtyAvailable), 0)
  const distinctItems = new Set(balances.map((b) => b.itemId)).size

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
          자재재고현황
        </h1>
        <p className="text-[15px] text-muted-foreground mt-1">
          MES &gt; 자재관리 · 원자재·소모품의 LOT별 현재고를 조회합니다.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="자재 품목 수" value={distinctItems.toLocaleString()} suffix="종" />
        <SummaryCard label="재고 라인" value={totalLines.toLocaleString()} suffix="건" />
        <SummaryCard label="총 현재고" value={totalOnHand.toLocaleString()} />
        <SummaryCard label="총 가용수량" value={totalAvailable.toLocaleString()} accent />
      </div>

      <MaterialStockDataTable data={balances} sites={sites} />
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
          accent ? "text-emerald-700" : "text-foreground"
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
