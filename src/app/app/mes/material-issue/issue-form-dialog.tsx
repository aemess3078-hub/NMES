"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle, Tag } from "lucide-react"
import {
  WorkOrderForIssue,
  WarehouseStockOption,
  LotStockOption,
  issueMaterialsForWorkOrder,
  getLotStockByWarehouse,
} from "@/lib/actions/material-issue.actions"
import { BarcodeScanInput, type ParsedBarcode } from "@/components/common/barcode/barcode-scan-input"
import { BarcodePrintDialog } from "@/components/common/barcode/barcode-print-dialog"

interface IssueFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workOrder: WorkOrderForIssue | null
  warehouses: WarehouseStockOption[]
  tenantId: string
}

export function IssueFormDialog({
  open,
  onOpenChange,
  workOrder,
  warehouses,
  tenantId,
}: IssueFormDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [warehouseId, setWarehouseId] = useState("")
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({})
  const [lotMap, setLotMap] = useState<Record<string, string>>({})               // itemId → lotId
  const [lotStockMap, setLotStockMap] = useState<Record<string, LotStockOption[]>>({})
  const [lotLoading, setLotLoading] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const pendingMaterials = workOrder?.materials.filter((m) => m.pendingQty > 0) ?? []
  const selectedWarehouse = warehouses.find((wh) => wh.id === warehouseId)

  // 창고 변경 시 LOT 선택 초기화 + LOT 재고 재조회
  useEffect(() => {
    setLotMap({})
    setLotStockMap({})
    if (!warehouseId || !workOrder) return

    const lotTrackedIds = workOrder.materials
      .filter((m) => m.pendingQty > 0 && m.item.isLotTracked)
      .map((m) => m.itemId)
    if (lotTrackedIds.length === 0) return

    let cancelled = false
    setLotLoading(true)
    getLotStockByWarehouse(warehouseId, lotTrackedIds, tenantId)
      .then((data) => { if (!cancelled) setLotStockMap(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLotLoading(false) })

    return () => { cancelled = true }
  }, [warehouseId, workOrder?.id, tenantId])

  if (!workOrder) return null

  function handleScan(parsed: ParsedBarcode) {
    const matched = pendingMaterials.find((m) => m.item.code === parsed.itemCode)
    if (!matched) {
      alert(`품목 코드 "${parsed.itemCode}"가 이 작업지시의 출고 자재에 없습니다.`)
      return
    }
    setHighlightedItemId(matched.itemId)
    rowRefs.current[matched.itemId]?.scrollIntoView({ behavior: "smooth", block: "center" })
    setTimeout(() => setHighlightedItemId(null), 3000)
  }

  const handleOpen = (v: boolean) => {
    if (!v) {
      setWarehouseId("")
      setQtyMap({})
      setLotMap({})
      setLotStockMap({})
    } else {
      const defaults: Record<string, string> = {}
      for (const m of pendingMaterials) {
        defaults[m.itemId] = String(m.pendingQty)
      }
      setQtyMap(defaults)
    }
    onOpenChange(v)
  }

  const handleSubmit = () => {
    if (!warehouseId) {
      alert("출고 창고를 선택하세요.")
      return
    }

    // LOT 관리 품목 중 출고수량 > 0인데 LOT 미선택인 항목 검증
    const missingLots = pendingMaterials.filter(
      (m) => m.item.isLotTracked && Number(qtyMap[m.itemId] ?? 0) > 0 && !lotMap[m.itemId]
    )
    if (missingLots.length > 0) {
      alert(
        `다음 LOT 관리 품목의 LOT를 선택하세요:\n${missingLots.map((m) => m.item.name).join("\n")}`
      )
      return
    }

    const items = pendingMaterials.map((m) => {
      const qty = Number(qtyMap[m.itemId] ?? 0)
      const selectedLotId = m.item.isLotTracked ? (lotMap[m.itemId] ?? null) : null
      const stock = getEffectiveStock(m, selectedLotId)
      if (qty > stock) {
        throw new Error(`${m.item.name}: 출고 수량(${qty})이 재고(${stock})를 초과합니다.`)
      }
      return {
        itemId: m.itemId,
        lotId: selectedLotId,
        issueQty: qty,
        requiredQty: m.requiredQty,
        reservationId: m.reservationId,
      }
    })

    try {
      startTransition(async () => {
        const res = await issueMaterialsForWorkOrder(
          {
            workOrderId: workOrder.id,
            siteId: workOrder.site.id,
            warehouseId,
            items,
          },
          tenantId
        )
        if (!res.ok) {
          alert(res.error ?? "오류가 발생했습니다.")
          return
        }
        router.refresh()
        handleOpen(false)
      })
    } catch (e) {
      alert(e instanceof Error ? e.message : "입력값을 확인하세요.")
    }
  }

  // 유효 재고 계산: LOT 관리 품목은 선택한 LOT 재고, 그 외는 창고 전체 재고
  function getEffectiveStock(
    m: (typeof pendingMaterials)[number],
    selectedLotId: string | null
  ): number {
    if (m.item.isLotTracked && selectedLotId) {
      return (
        lotStockMap[m.itemId]?.find((ls) => ls.lotId === selectedLotId)?.qtyAvailable ?? 0
      )
    }
    return selectedWarehouse?.itemStocks[m.itemId] ?? m.currentStock
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-[18px]">자재 출고 처리</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto">
          {/* 바코드 스캔 */}
          <div className="space-y-1">
            <p className="text-[13px] font-medium text-muted-foreground">바코드 스캔</p>
            <BarcodeScanInput
              onScan={handleScan}
              placeholder="자재 바코드를 스캔하면 해당 행으로 이동합니다"
            />
          </div>

          {/* 작업지시 정보 */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-1">
            <div className="text-[13px] text-muted-foreground">작업지시</div>
            <div className="text-[15px] font-medium">
              {workOrder.orderNo}{" "}
              <span className="text-muted-foreground font-normal text-[14px]">
                — [{workOrder.item.code}] {workOrder.item.name}
              </span>
            </div>
            <div className="text-[13px] text-muted-foreground">
              계획수량: {workOrder.plannedQty.toLocaleString()} | {workOrder.site.name}
            </div>
          </div>

          {/* 출고 창고 선택 */}
          <div className="space-y-1.5">
            <Label className="text-[14px]">출고 창고</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="text-[14px]">
                <SelectValue placeholder="창고 선택" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((wh) => (
                  <SelectItem key={wh.id} value={wh.id} className="text-[14px]">
                    [{wh.code}] {wh.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 자재별 출고 수량 */}
          <div className="space-y-2">
            <div className="text-[14px] font-medium">출고 자재 목록</div>

            {pendingMaterials.length === 0 ? (
              <p className="text-[14px] text-muted-foreground py-2">
                모든 자재가 이미 출고되었습니다.
              </p>
            ) : (
              <div className="rounded-md border overflow-hidden">
                {/* 헤더 */}
                <div className="grid grid-cols-[1fr_80px_80px_80px_100px] bg-muted/30 border-b">
                  {["품목명 / LOT", "필요수량", "재고", "기출고", "출고수량"].map((h) => (
                    <div key={h} className="py-2 px-3 text-[13px] font-medium text-muted-foreground text-right first:text-left">
                      {h}
                    </div>
                  ))}
                </div>

                {/* 자재 행 */}
                {pendingMaterials.map((m) => {
                  const selectedLotId = m.item.isLotTracked ? (lotMap[m.itemId] ?? null) : null
                  const stock = getEffectiveStock(m, selectedLotId)
                  const issueQty = Number(qtyMap[m.itemId] ?? 0)
                  const isOverStock = issueQty > stock
                  const isHighlighted = highlightedItemId === m.itemId
                  const lotOptions = lotStockMap[m.itemId] ?? []
                  const lotMissing = m.item.isLotTracked && issueQty > 0 && !selectedLotId

                  return (
                    <div
                      key={m.itemId}
                      ref={(el) => { rowRefs.current[m.itemId] = el }}
                      className={`grid grid-cols-[1fr_80px_80px_80px_100px] items-start border-b last:border-0 transition-colors duration-300 ${
                        isHighlighted ? "bg-green-50 border-green-300" : "hover:bg-muted/10"
                      }`}
                    >
                      {/* 품목명 + LOT 선택 */}
                      <div className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[14px] font-medium">{m.item.name}</span>
                          {m.item.isLotTracked && (
                            <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                              <Tag className="h-2.5 w-2.5" />
                              LOT
                            </span>
                          )}
                        </div>
                        <div className="text-[12px] text-muted-foreground font-mono mt-0.5">
                          {m.item.code} · {m.item.uom}
                        </div>

                        {/* LOT 선택 드롭다운 (LOT 관리 품목 + 창고 선택 시) */}
                        {m.item.isLotTracked && (
                          <div className="mt-2">
                            {warehouseId ? (
                              <Select
                                value={lotMap[m.itemId] ?? ""}
                                onValueChange={(v) =>
                                  setLotMap((prev) => ({ ...prev, [m.itemId]: v }))
                                }
                                disabled={lotLoading}
                              >
                                <SelectTrigger
                                  className={`h-7 text-[12px] w-full ${
                                    lotMissing
                                      ? "border-amber-400 ring-amber-200"
                                      : ""
                                  }`}
                                >
                                  <SelectValue
                                    placeholder={lotLoading ? "조회 중..." : "LOT 선택 (필수)"}
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  {lotOptions.length > 0 ? (
                                    lotOptions.map((ls) => (
                                      <SelectItem
                                        key={ls.lotId}
                                        value={ls.lotId}
                                        className="text-[12px]"
                                      >
                                        <span className="font-mono">{ls.lotNo}</span>
                                        <span className="ml-2 text-muted-foreground">
                                          ({ls.qtyAvailable.toLocaleString()})
                                        </span>
                                      </SelectItem>
                                    ))
                                  ) : (
                                    <div className="px-2 py-1.5 text-[12px] text-muted-foreground">
                                      {lotLoading ? "조회 중..." : "가용 LOT 없음"}
                                    </div>
                                  )}
                                </SelectContent>
                              </Select>
                            ) : (
                              <p className="text-[11px] text-amber-600">
                                창고를 선택하면 LOT를 지정할 수 있습니다.
                              </p>
                            )}
                            {lotMissing && (
                              <p className="text-[11px] text-amber-600 mt-0.5 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                LOT를 선택해야 출고할 수 있습니다.
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 필요수량 */}
                      <div className="py-2.5 px-3 text-[14px] text-right">
                        {m.requiredQty.toLocaleString()}
                      </div>

                      {/* 재고 (LOT 선택 시 LOT별 재고 표시) */}
                      <div
                        className={`py-2.5 px-3 text-[14px] text-right font-medium ${
                          stock < m.pendingQty ? "text-red-600" : "text-green-700"
                        }`}
                      >
                        {stock.toLocaleString()}
                        {m.item.isLotTracked && selectedLotId && (
                          <div className="text-[10px] text-muted-foreground font-normal">LOT</div>
                        )}
                      </div>

                      {/* 기출고 */}
                      <div className="py-2.5 px-3 text-[14px] text-right text-muted-foreground">
                        {m.issuedQty.toLocaleString()}
                      </div>

                      {/* 출고수량 입력 */}
                      <div className="py-2.5 px-3">
                        <div className="relative">
                          <Input
                            type="number"
                            min={0}
                            max={m.pendingQty}
                            step={0.001}
                            value={qtyMap[m.itemId] ?? ""}
                            onChange={(e) =>
                              setQtyMap((prev) => ({
                                ...prev,
                                [m.itemId]: e.target.value,
                              }))
                            }
                            className={`h-7 text-[13px] text-right pr-2 ${
                              isOverStock ? "border-red-400 focus-visible:ring-red-400" : ""
                            }`}
                          />
                          {isOverStock && (
                            <AlertCircle className="absolute right-7 top-1.5 h-3.5 w-3.5 text-red-500" />
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 재고 부족 경고 */}
          {warehouseId &&
            pendingMaterials.some(
              (m) =>
                (selectedWarehouse?.itemStocks[m.itemId] ?? 0) < m.pendingQty
            ) && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[13px] text-amber-800">
                  일부 자재의 재고가 필요 수량보다 부족합니다. 출고 가능한 수량 내에서 처리하세요.
                </p>
              </div>
            )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setPrintOpen(true)}
            className="mr-auto"
            disabled={pendingMaterials.length === 0}
          >
            바코드 라벨 출력
          </Button>
          <Button variant="outline" onClick={() => handleOpen(false)} disabled={isPending}>
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !warehouseId || pendingMaterials.length === 0}
          >
            {isPending ? "처리 중..." : "출고 처리"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <BarcodePrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        title={`출고 자재 라벨 — ${workOrder.orderNo}`}
        items={pendingMaterials.map((m) => ({
          itemCode: m.item.code,
          itemName: m.item.name,
          quantity: Number(qtyMap[m.itemId] ?? m.pendingQty),
          uom: m.item.uom,
        }))}
      />
    </Dialog>
  )
}
