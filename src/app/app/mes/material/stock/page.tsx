import {
  getMaterialInventoryBalances,
  getSitesForInventory,
} from "@/lib/actions/inventory.actions"
import { MaterialStockDataTable } from "./material-stock-data-table"

export const dynamic = "force-dynamic"

export default async function MaterialStockPage() {
  const [balances, sites] = await Promise.all([
    getMaterialInventoryBalances(),
    getSitesForInventory(),
  ])

  const totalLines = balances.length
  const lotLines = balances.filter((balance) => balance.lotId).length
  const totalOnHand = balances.reduce((sum, balance) => sum + Number(balance.qtyOnHand), 0)
  const totalAvailable = balances.reduce((sum, balance) => sum + Number(balance.qtyAvailable), 0)
  const distinctItems = new Set(balances.map((balance) => balance.itemId)).size

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
          원자재 LOT 재고
        </h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          의료기기 제조에 투입되는 원자재와 소모품의 LOT별 현재고를 확인합니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <SummaryCard label="원자재 품목" value={distinctItems.toLocaleString()} suffix="종" />
        <SummaryCard label="재고 라인" value={totalLines.toLocaleString()} suffix="건" />
        <SummaryCard label="LOT 라인" value={lotLines.toLocaleString()} suffix="건" />
        <SummaryCard label="총 현재고" value={totalOnHand.toLocaleString()} />
        <SummaryCard label="총 가용재고" value={totalAvailable.toLocaleString()} accent />
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
