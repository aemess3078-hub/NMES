"use client"

import { useMemo, useState } from "react"
import { Search, X, AlertTriangle } from "lucide-react"
import { DataTable } from "@/components/common/data-table"
import { getGroupedColumns } from "./columns"
import type { GroupedMaterialStock, LotBalanceDetail } from "@/lib/actions/inventory.actions"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"

function formatDate(value: string | null | undefined): string {
  if (!value) return "-"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "-"
  return d.toISOString().slice(0, 10)
}

// ── LOT 상세 패널 ─────────────────────────────────────────────────────────────

function LotDetailPanel({
  item,
  onClose,
}: {
  item: GroupedMaterialStock
  onClose: () => void
}) {
  const unlottedRows = item.lotBalances.filter((b) => !b.lotId && b.qtyOnHand > 0)
  const lottedRows = item.lotBalances.filter((b) => b.lotId)

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 shadow-sm">
      {/* 헤더 */}
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="text-[13px] text-muted-foreground">LOT별 재고 상세</p>
          <h3 className="mt-0.5 text-[16px] font-semibold text-foreground">
            [{item.itemCode}] {item.itemName}
          </h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* LOT 미지정 경고 */}
      {unlottedRows.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="text-[13px] font-semibold text-amber-800">LOT 미지정 재고 있음</p>
            <p className="text-[12px] text-amber-700">
              이 품목은 LOT 관리 대상이지만 LOT가 지정되지 않은 재고가 있어 출고 대상에서 제외됩니다.
              관리자에게 재고 정리를 요청하세요.
            </p>
            {unlottedRows.map((b) => (
              <p key={b.balanceId} className="mt-1 text-[12px] text-amber-700 font-mono">
                [{b.warehouseCode}] {b.warehouseName} — 현재고 {b.qtyOnHand.toLocaleString()} {item.uom}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* LOT별 테이블 */}
      {lottedRows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full min-w-[700px] text-[13px]">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">LOT 번호</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">창고 / 사이트</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">현재고</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">가용재고</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">보류재고</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">입고일</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">최근출고</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">유통기한</th>
              </tr>
            </thead>
            <tbody>
              {lottedRows.map((b) => (
                <tr key={b.balanceId} className="border-b last:border-0 hover:bg-muted/10">
                  <td className="px-3 py-2 font-mono text-blue-700">{b.lotNo ?? "-"}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">[{b.warehouseCode}] {b.warehouseName}</div>
                    <div className="text-[12px] text-muted-foreground">{b.siteName}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {b.qtyOnHand.toLocaleString()}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${b.qtyAvailable <= 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {b.qtyAvailable.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {b.qtyHold > 0 ? b.qtyHold.toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {formatDate(b.lastReceiptAt ?? b.manufactureDate)}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {formatDate(b.lastIssueAt)}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {formatDate(b.expiryDate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !unlottedRows.length && (
          <p className="py-4 text-center text-[14px] text-muted-foreground">LOT 재고 없음</p>
        )
      )}
    </div>
  )
}

// ── 메인 테이블 컴포넌트 ──────────────────────────────────────────────────────

interface MaterialStockDataTableProps {
  data: GroupedMaterialStock[]
}

export function MaterialStockDataTable({ data }: MaterialStockDataTableProps) {
  const columns = getGroupedColumns()
  const [keyword, setKeyword] = useState("")
  const [inStockOnly, setInStockOnly] = useState(true)
  const [selectedItem, setSelectedItem] = useState<GroupedMaterialStock | null>(null)

  const filteredData = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return data.filter((group) => {
      if (inStockOnly && group.totalQtyOnHand <= 0) return false
      if (kw.length === 0) return true
      const hay = [
        group.itemCode,
        group.itemName,
        group.itemSpec ?? "",
        ...group.lotBalances.map((b) => b.lotNo ?? ""),
        ...group.lotBalances.map((b) => b.warehouseName),
      ].join(" ").toLowerCase()
      return hay.includes(kw)
    })
  }, [data, keyword, inStockOnly])

  const filterableColumns = [
    {
      id: "itemType" as keyof GroupedMaterialStock,
      title: "품목유형",
      options: [
        { label: "원자재", value: "RAW_MATERIAL" },
        { label: "소모품", value: "CONSUMABLE" },
      ],
    },
  ]

  function handleRowClick(row: GroupedMaterialStock) {
    setSelectedItem((prev) => (prev?.itemId === row.itemId ? null : row))
  }

  return (
    <div className="space-y-4">
      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="품목명 / 규격 / LOT 번호 / 창고 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="h-9 w-[320px] pl-9 text-[14px]"
          />
        </div>
        <label className="flex items-center gap-2 text-[14px] text-muted-foreground">
          <Checkbox
            checked={inStockOnly}
            onCheckedChange={(checked) => setInStockOnly(checked === true)}
          />
          재고 있음만 보기
        </label>
        {selectedItem && (
          <span className="text-[13px] text-blue-700">
            선택: <span className="font-mono font-medium">{selectedItem.itemCode}</span> — 행을 다시 클릭하면 닫힙니다
          </span>
        )}
      </div>

      {/* 품목 그룹화 테이블 */}
      <DataTable
        columns={columns}
        data={filteredData}
        filterableColumns={filterableColumns}
        onRowClick={handleRowClick}
      />

      {/* LOT 상세 패널 */}
      {selectedItem && (
        <LotDetailPanel
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  )
}
