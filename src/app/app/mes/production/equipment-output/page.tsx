import { getEquipmentOutputStats } from "@/lib/actions/equipment-output.actions"
import { EquipmentOutputDataTable } from "./equipment-output-data-table"

export const dynamic = "force-dynamic"

export default async function EquipmentOutputPage() {
  // ── [PERF-TEMP] 성능 계측 임시 코드 — 측정 완료 후 제거 ──────────────────
  const _pt0 = Date.now()
  // ─────────────────────────────────────────────────────────────────────────
  const rows = await getEquipmentOutputStats()
  // ── [PERF-TEMP] ──────────────────────────────────────────────────────────
  console.log(`[PERF] equipmentOutput.getEquipmentOutputStats ${Date.now() - _pt0}ms  rows=${rows.length}`)
  console.log(`[PERF] equipmentOutput.page.total ${Date.now() - _pt0}ms`)
  // ─────────────────────────────────────────────────────────────────────────

  const totalEquipment = rows.length
  const totalGood      = rows.reduce((s, r) => s + r.goodQty,   0)
  const totalDefect    = rows.reduce((s, r) => s + r.defectQty, 0)
  const totalRework    = rows.reduce((s, r) => s + r.reworkQty, 0)
  const avgDefectRate  =
    (totalGood + totalDefect + totalRework) > 0
      ? (totalDefect / (totalGood + totalDefect + totalRework)) * 100
      : 0

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
          설비별 생산현황
        </h1>
        <p className="text-[15px] text-muted-foreground mt-1">
          MES &gt; 생산관리 · 설비에 배정된 공정의 생산실적을 설비 단위로 집계합니다.
        </p>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="집계 설비"
          value={totalEquipment}
          suffix="대"
        />
        <SummaryCard
          label="총 양품수량"
          value={totalGood}
          suffix="개"
          accent="green"
        />
        <SummaryCard
          label="총 불량수량"
          value={totalDefect}
          suffix="개"
          accent={totalDefect > 0 ? "red" : undefined}
        />
        <SummaryCard
          label="평균 불량률"
          value={avgDefectRate}
          suffix="%"
          isDecimal
          accent={
            avgDefectRate >= 5 ? "red"
            : avgDefectRate > 0 ? "amber"
            : undefined
          }
        />
      </div>

      {/* 테이블 */}
      <EquipmentOutputDataTable data={rows} />
    </div>
  )
}

// ─── 요약 카드 ────────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  suffix,
  accent,
  isDecimal,
}: {
  label:      string
  value:      number
  suffix?:    string
  accent?:    "green" | "amber" | "red"
  isDecimal?: boolean
}) {
  const textColor =
    accent === "green" ? "text-emerald-700"
    : accent === "amber" ? "text-amber-600"
    : accent === "red"   ? "text-red-600"
    : "text-foreground"

  const display = isDecimal ? value.toFixed(1) : value.toLocaleString()

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-[22px] font-semibold tabular-nums ${textColor}`}>
        {display}
        {suffix && (
          <span className="ml-1 text-[14px] font-normal text-muted-foreground">
            {suffix}
          </span>
        )}
      </p>
    </div>
  )
}
