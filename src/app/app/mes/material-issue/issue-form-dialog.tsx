"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, Tag } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  getLotStockByItems,
  issueMaterialsForWorkOrder,
  type LotStockOption,
  type MaterialRequirement,
  type WarehouseStockOption,
  type WorkOrderForIssue,
} from "@/lib/actions/material-issue.actions"

function isLotManaged(item: MaterialRequirement["item"]): boolean {
  return item.isLotTracked || item.itemType === "SEMI_FINISHED"
}
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
  const [warehouseMap, setWarehouseMap] = useState<Record<string, string>>({})
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({})
  const [lotMap, setLotMap] = useState<Record<string, string>>({})
  const [lotStockMap, setLotStockMap] = useState<Record<string, LotStockOption[]>>({})
  const [lotLoadingMap, setLotLoadingMap] = useState<Record<string, boolean>>({})
  const [printOpen, setPrintOpen] = useState(false)
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const pendingMaterials = workOrder?.materials.filter((material) => material.pendingQty > 0) ?? []

  // Radix controlled Dialog에서 부모가 open=true로 바꿀 때 onOpenChange가 호출되지 않으므로
  // useEffect에서 open 변화를 감지해 초기화 및 LOT 재고 로드를 수행한다.
  useEffect(() => {
    if (!open || !workOrder) return

    const materials = workOrder.materials.filter((m) => m.pendingQty > 0)
    const defaults: Record<string, string> = {}
    const defaultWarehouses: Record<string, string> = {}

    for (const material of materials) {
      defaults[material.itemId] = String(material.pendingQty)
      if (!isLotManaged(material.item)) {
        const stockWh = warehouses.find((wh) => (wh.itemStocks[material.itemId] ?? 0) > 0)
        const rawWh = warehouses.find((wh) => wh.code === "WH-RAW")
        defaultWarehouses[material.itemId] = stockWh?.id ?? rawWh?.id ?? warehouses[0]?.id ?? ""
      }
    }

    setQtyMap(defaults)
    setWarehouseMap(defaultWarehouses)
    setLotMap({})
    setLotStockMap({})
    setLotLoadingMap({})

    for (const material of materials) {
      if (!isLotManaged(material.item)) continue
      const itemId = material.itemId
      setLotLoadingMap((prev) => ({ ...prev, [itemId]: true }))
      getLotStockByItems([itemId], tenantId)
        .then((data) => {
          setLotStockMap((prev) => ({ ...prev, [itemId]: data[itemId] ?? [] }))
        })
        .catch(() => {
          setLotStockMap((prev) => ({ ...prev, [itemId]: [] }))
        })
        .finally(() => {
          setLotLoadingMap((prev) => ({ ...prev, [itemId]: false }))
        })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workOrder?.id])

  if (!workOrder) return null

  const getLotSelectValue = (lotStock: LotStockOption) => `${lotStock.lotId}:${lotStock.warehouseId}`

  const getSelectedLot = (itemId: string) => {
    const selectedValue = lotMap[itemId]
    if (!selectedValue) return null
    return lotStockMap[itemId]?.find((lotStock) => getLotSelectValue(lotStock) === selectedValue) ?? null
  }

  const getDefaultWarehouseId = (itemId: string) => {
    const stockWarehouse = warehouses.find((warehouse) => (warehouse.itemStocks[itemId] ?? 0) > 0)
    const rawWarehouse = warehouses.find((warehouse) => warehouse.code === "WH-RAW")
    return stockWarehouse?.id ?? rawWarehouse?.id ?? warehouses[0]?.id ?? ""
  }

  const loadLotStock = async (itemId: string) => {
    setLotLoadingMap((prev) => ({ ...prev, [itemId]: true }))
    try {
      const data = await getLotStockByItems([itemId], tenantId)
      setLotStockMap((prev) => ({ ...prev, [itemId]: data[itemId] ?? [] }))
    } catch {
      setLotStockMap((prev) => ({ ...prev, [itemId]: [] }))
    } finally {
      setLotLoadingMap((prev) => ({ ...prev, [itemId]: false }))
    }
  }

  const handleWarehouseChange = (itemId: string, nextWarehouseId: string) => {
    setWarehouseMap((prev) => ({ ...prev, [itemId]: nextWarehouseId }))
  }

  function handleScan(parsed: ParsedBarcode) {
    const matched = pendingMaterials.find((material) => material.item.code === parsed.itemCode)
    if (!matched) {
      alert(`품목 코드 "${parsed.itemCode}"가 이 작업지시의 출고 원자재에 없습니다.`)
      return
    }
    setHighlightedItemId(matched.itemId)
    rowRefs.current[matched.itemId]?.scrollIntoView({ behavior: "smooth", block: "center" })
    setTimeout(() => setHighlightedItemId(null), 3000)
  }

  const handleOpen = (nextOpen: boolean) => {
    if (!nextOpen) {
      setWarehouseMap({})
      setQtyMap({})
      setLotMap({})
      setLotStockMap({})
      setLotLoadingMap({})
    }
    onOpenChange(nextOpen)
  }

  function getEffectiveStock(
    material: (typeof pendingMaterials)[number],
    selectedWarehouseId: string,
    selectedLot: LotStockOption | null,
  ): number {
    if (isLotManaged(material.item)) {
      return selectedLot?.qtyAvailable ?? 0
    }
    const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === selectedWarehouseId)
    return selectedWarehouse?.itemStocks[material.itemId] ?? 0
  }

  const handleSubmit = () => {
    const missingWarehouses = pendingMaterials.filter(
      (material) =>
        !isLotManaged(material.item) &&
        Number(qtyMap[material.itemId] ?? 0) > 0 &&
        !warehouseMap[material.itemId],
    )
    if (missingWarehouses.length > 0) {
      alert(`다음 원자재의 출고 창고를 선택해 주세요.\n${missingWarehouses.map((material) => material.item.name).join("\n")}`)
      return
    }

    const missingLots = pendingMaterials.filter(
      (material) => isLotManaged(material.item) && Number(qtyMap[material.itemId] ?? 0) > 0 && !lotMap[material.itemId],
    )
    if (missingLots.length > 0) {
      alert(`다음 LOT 관리 품목의 LOT를 선택해 주세요.\n${missingLots.map((material) => material.item.name).join("\n")}`)
      return
    }

    try {
      const items = pendingMaterials.map((material) => {
        const issueQty = Number(qtyMap[material.itemId] ?? 0)
        const selectedLot = isLotManaged(material.item) ? getSelectedLot(material.itemId) : null
        const selectedWarehouseId = isLotManaged(material.item)
          ? (selectedLot?.warehouseId ?? "")
          : (warehouseMap[material.itemId] ?? "")
        const selectedLotId = selectedLot?.lotId ?? null
        const stock = getEffectiveStock(material, selectedWarehouseId, selectedLot)

        if (issueQty > stock) {
          throw new Error(`${material.item.name}: 출고 수량(${issueQty})이 재고(${stock})를 초과합니다.`)
        }

        return {
          itemId: material.itemId,
          warehouseId: selectedWarehouseId,
          lotId: selectedLotId,
          issueQty,
          requiredQty: material.requiredQty,
          reservationId: material.reservationId,
        }
      })

      startTransition(async () => {
        const result = await issueMaterialsForWorkOrder(
          {
            workOrderId: workOrder.id,
            siteId: workOrder.site.id,
            items,
          },
          tenantId,
        )
        if (!result.ok) {
          alert(result.error ?? "출고 처리 중 오류가 발생했습니다.")
          return
        }
        router.refresh()
        handleOpen(false)
      })
    } catch (error) {
      alert(error instanceof Error ? error.message : "입력값을 확인해 주세요.")
    }
  }

  const hasOverStock = pendingMaterials.some((material) => {
    const selectedWarehouseId = warehouseMap[material.itemId] ?? ""
    const selectedLot = isLotManaged(material.item) ? getSelectedLot(material.itemId) : null
    if (isLotManaged(material.item) && !selectedLot) return false
    return getEffectiveStock(material, selectedWarehouseId, selectedLot) < Number(qtyMap[material.itemId] ?? 0)
  })

  const selectedLotSummaries = pendingMaterials
    .map((material) => {
      const lotStock = getSelectedLot(material.itemId)
      if (!lotStock) return null
      return {
        itemName: material.item.name,
        lotNo: lotStock.lotNo,
        warehouseName: `[${lotStock.warehouseCode}] ${lotStock.warehouseName}`,
        qty: Number(qtyMap[material.itemId] ?? 0),
        unit: lotStock.unit,
      }
    })
    .filter((summary): summary is { itemName: string; lotNo: string; warehouseName: string; qty: number; unit: string } => summary != null)

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="text-[18px]">자재 LOT 출고 처리</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto py-2">
          <div className="space-y-1">
            <p className="text-[13px] font-medium text-muted-foreground">바코드 스캔</p>
            <BarcodeScanInput
              onScan={handleScan}
              placeholder="자재 바코드를 스캔하면 해당 행으로 이동합니다."
            />
          </div>

          <div className="rounded-lg bg-muted/50 p-3">
            <div className="grid grid-cols-1 gap-3 text-[14px] md:grid-cols-3">
              <div>
                <p className="text-[13px] text-muted-foreground">작업지시번호</p>
                <p className="font-mono font-medium">{workOrder.orderNo}</p>
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground">제조번호</p>
                <p className="font-mono font-medium text-blue-700">{workOrder.manufacturingNo ?? "-"}</p>
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground">가공 제품명</p>
                <p className="font-medium">[{workOrder.item.code}] {workOrder.item.name}</p>
              </div>
            </div>
            <div className="mt-2 text-[13px] text-muted-foreground">
              계획수량: {workOrder.plannedQty.toLocaleString()} | {workOrder.site.name}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[14px] font-medium">출고 자재 목록</div>
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              현재 출고 가능한 LOT만 표시됩니다. LOT 미지정 재고는 LOT 추적성 기준상
              출고 대상에서 제외되며, 관리자에게 재고 정리를 요청하세요.
            </p>

            {pendingMaterials.length === 0 ? (
              <p className="py-2 text-[14px] text-muted-foreground">
                모든 원자재가 이미 출고되었습니다.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <div className="grid min-w-[940px] grid-cols-[minmax(260px,1fr)_170px_90px_90px_90px_110px_130px] border-b bg-muted/30">
                  <div className="px-3 py-2 text-[13px] font-medium text-muted-foreground">소재명 / 규격 / LOT</div>
                  <div className="px-3 py-2 text-[13px] font-medium text-muted-foreground">출고창고</div>
                  {["필요수량", "재고", "기출고", "출고수량", "연결 LOT"].map((header) => (
                    <div key={header} className="px-3 py-2 text-right text-[13px] font-medium text-muted-foreground">
                      {header}
                    </div>
                  ))}
                </div>

                {pendingMaterials.map((material) => {
                  const selectedLot = isLotManaged(material.item) ? getSelectedLot(material.itemId) : null
                  const selectedWarehouseId = isLotManaged(material.item)
                    ? (selectedLot?.warehouseId ?? "")
                    : (warehouseMap[material.itemId] ?? "")
                  const selectedLotId = selectedLot?.lotId ?? null
                  const stock = getEffectiveStock(material, selectedWarehouseId, selectedLot)
                  const issueQty = Number(qtyMap[material.itemId] ?? 0)
                  const isOverStock = isLotManaged(material.item) && !selectedLot ? false : issueQty > stock
                  const isHighlighted = highlightedItemId === material.itemId
                  const lotOptions = lotStockMap[material.itemId] ?? []
                  const lotLoading = lotLoadingMap[material.itemId] ?? false
                  const warehouseMissing = !isLotManaged(material.item) && issueQty > 0 && !selectedWarehouseId
                  const lotMissing = isLotManaged(material.item) && issueQty > 0 && !selectedLotId

                  return (
                    <div
                      key={material.itemId}
                      ref={(element) => {
                        rowRefs.current[material.itemId] = element
                      }}
                      className={`grid min-w-[940px] grid-cols-[minmax(260px,1fr)_170px_90px_90px_90px_110px_130px] items-start border-b transition-colors duration-300 last:border-0 ${
                        isHighlighted ? "border-green-300 bg-green-50" : "hover:bg-muted/10"
                      }`}
                    >
                      <div className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[14px] font-medium">{material.item.name}</span>
                          {isLotManaged(material.item) && (
                            <span className="inline-flex items-center gap-0.5 rounded border border-blue-200 bg-blue-50 px-1 py-0.5 text-[11px] font-medium text-blue-700">
                              <Tag className="h-3 w-3" />
                              LOT
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[13px] text-muted-foreground">
                          <span className="font-mono">{material.item.code}</span>
                          <span className="mx-1">/</span>
                          <span>{material.item.spec ?? "규격 없음"}</span>
                          <span className="mx-1">/</span>
                          <span>{material.item.uom}</span>
                        </div>

                        {isLotManaged(material.item) && (
                          <div className="mt-2 space-y-1">
                            <p className="text-[13px] text-muted-foreground">
                              LOT를 선택하면 해당 LOT가 보관된 창고에서 자동 출고됩니다.
                            </p>
                            <Select
                                value={lotMap[material.itemId] ?? ""}
                                onValueChange={(value) =>
                                  setLotMap((prev) => ({ ...prev, [material.itemId]: value }))
                                }
                                disabled={lotLoading}
                              >
                                <SelectTrigger className={`h-8 w-full text-[13px] ${lotMissing ? "border-amber-400 ring-amber-200" : ""}`}>
                                  <SelectValue placeholder={lotLoading ? "조회 중..." : "LOT 선택 (필수)"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {lotOptions.length > 0 ? (
                                    lotOptions.map((lotStock) => (
                                      <SelectItem key={getLotSelectValue(lotStock)} value={getLotSelectValue(lotStock)} className="text-[13px]">
                                        {lotStock.lotNo} / [{lotStock.warehouseCode}] {lotStock.warehouseName} / 가용 {lotStock.qtyAvailable.toLocaleString()} {lotStock.unit}
                                      </SelectItem>
                                    ))
                                  ) : (
                                    <div className="px-2 py-1.5 text-[13px] text-muted-foreground">
                                      {lotLoading ? "조회 중..." : "가용 LOT 없음"}
                                    </div>
                                  )}
                                </SelectContent>
                              </Select>
                            {lotMissing && (
                              <p className="mt-0.5 flex items-center gap-1 text-[12px] text-amber-600">
                                <AlertCircle className="h-3 w-3" />
                                LOT를 선택해야 출고할 수 있습니다.
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="px-3 py-2.5">
                        {isLotManaged(material.item) ? (
                          <div className="rounded-md border bg-muted/30 px-2.5 py-2 text-[13px]">
                            {selectedLot ? (
                              <>
                                <div className="font-medium">[{selectedLot.warehouseCode}] {selectedLot.warehouseName}</div>
                                <div className="mt-0.5 text-muted-foreground">LOT 선택으로 자동 지정</div>
                              </>
                            ) : (
                              <span className="text-muted-foreground">LOT 선택 필요</span>
                            )}
                          </div>
                        ) : (
                          <>
                            <p className="mb-1 text-[13px] text-muted-foreground">
                              기본 출고창고가 자동 선택되며 필요 시 변경할 수 있습니다.
                            </p>
                            <Select
                              value={selectedWarehouseId}
                              onValueChange={(value) => handleWarehouseChange(material.itemId, value)}
                            >
                              <SelectTrigger className={`h-8 text-[13px] ${warehouseMissing ? "border-amber-400 ring-amber-200" : ""}`}>
                                <SelectValue placeholder="창고 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                {warehouses.map((warehouse) => (
                                  <SelectItem key={warehouse.id} value={warehouse.id} className="text-[13px]">
                                    [{warehouse.code}] {warehouse.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {warehouseMissing && (
                              <p className="mt-1 text-[12px] text-amber-600">
                                출고창고를 선택해 주세요.
                              </p>
                            )}
                          </>
                        )}
                      </div>

                      <div className="px-3 py-2.5 text-right text-[14px]">
                        {material.requiredQty.toLocaleString()}
                      </div>
                      <div className={`px-3 py-2.5 text-right text-[14px] font-medium ${stock < material.pendingQty ? "text-red-600" : "text-green-700"}`}>
                        {stock.toLocaleString()}
                        {isLotManaged(material.item) && selectedLotId && (
                          <div className="text-[11px] font-normal text-muted-foreground">LOT 잔량</div>
                        )}
                      </div>
                      <div className="px-3 py-2.5 text-right text-[14px] text-muted-foreground">
                        {material.issuedQty.toLocaleString()}
                      </div>
                      <div className="px-3 py-2.5">
                        <div className="relative">
                          <Input
                            type="number"
                            min={0}
                            max={material.pendingQty}
                            step={0.001}
                            value={qtyMap[material.itemId] ?? ""}
                            onChange={(event) =>
                              setQtyMap((prev) => ({
                                ...prev,
                                [material.itemId]: event.target.value,
                              }))
                            }
                            className={`h-8 pr-2 text-right text-[13px] ${isOverStock ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                          />
                          {isOverStock && (
                            <AlertCircle className="absolute right-7 top-2 h-3.5 w-3.5 text-red-500" />
                          )}
                        </div>
                      </div>
                      <div className="px-3 py-2.5 text-right">
                        <span className="font-mono text-[13px] text-blue-700">
                          {selectedLot?.lotNo ?? "-"}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {selectedLotSummaries.length > 0 && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
              <p className="text-[13px] font-medium text-blue-800">
                제조번호에 연결될 자재 LOT
              </p>
              <div className="mt-2 grid gap-1 text-[13px] text-blue-900 md:grid-cols-2">
                {selectedLotSummaries.map((summary) => (
                  <div key={`${summary.itemName}-${summary.lotNo}`}>
                    {summary.itemName} / <span className="font-mono">{summary.lotNo}</span> / {summary.warehouseName} / {summary.qty.toLocaleString()} {summary.unit}
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasOverStock && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-[13px] text-amber-800">
                일부 원자재의 선택 창고 또는 LOT 재고가 출고 수량보다 부족합니다.
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
            disabled={isPending || pendingMaterials.length === 0}
          >
            {isPending ? "처리 중..." : "출고 처리"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <BarcodePrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        title={`출고 자재 라벨 - ${workOrder.orderNo}`}
        items={pendingMaterials.map((material) => ({
          itemCode: material.item.code,
          itemName: material.item.name,
          quantity: Number(qtyMap[material.itemId] ?? material.pendingQty),
          uom: material.item.uom,
        }))}
      />
    </Dialog>
  )
}
