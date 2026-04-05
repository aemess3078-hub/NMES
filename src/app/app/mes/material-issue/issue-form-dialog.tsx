"use client"

import { useState, useTransition, useRef } from "react"
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
import { Badge } from "@/components/ui/badge"
import { AlertCircle } from "lucide-react"
import {
  WorkOrderForIssue,
  WarehouseStockOption,
  issueMaterialsForWorkOrder,
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
  const [printOpen, setPrintOpen] = useState(false)
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  if (!workOrder) return null

  const pendingMaterials = workOrder.materials.filter((m) => m.pendingQty > 0)
  const selectedWarehouse = warehouses.find((wh) => wh.id === warehouseId)

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

    const items = pendingMaterials.map((m) => {
      const qty = Number(qtyMap[m.itemId] ?? 0)
      const stock = selectedWarehouse?.itemStocks[m.itemId] ?? 0
      if (qty > stock) {
        throw new Error(`${m.item.name}: 출고 수량(${qty})이 재고(${stock})를 초과합니다.`)
      }
      return {
        itemId: m.itemId,
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
                  {["품목명", "필요수량", "재고", "기출고", "출고수량"].map((h) => (
                    <div key={h} className="py-2 px-3 text-[13px] font-medium text-muted-foreground text-right first:text-left">
                      {h}
                    </div>
                  ))}
                </div>

                {/* 자재 행 */}
                {pendingMaterials.map((m) => {
                  const stock = selectedWarehouse?.itemStocks[m.itemId] ?? m.currentStock
                  const issueQty = Number(qtyMap[m.itemId] ?? 0)
                  const isOverStock = issueQty > stock
                  const isHighlighted = highlightedItemId === m.itemId

                  return (
                    <div
                      key={m.itemId}
                      ref={(el) => { rowRefs.current[m.itemId] = el }}
                      className={`grid grid-cols-[1fr_80px_80px_80px_100px] items-center border-b last:border-0 transition-colors duration-300 ${
                        isHighlighted ? "bg-green-50 border-green-300" : "hover:bg-muted/10"
                      }`}
                    >
                      <div className="py-2.5 px-3">
                        <div className="text-[14px] font-medium">{m.item.name}</div>
                        <div className="text-[12px] text-muted-foreground font-mono">
                          {m.item.code} · {m.item.uom}
                        </div>
                      </div>
                      <div className="py-2.5 px-3 text-[14px] text-right">
                        {m.requiredQty.toLocaleString()}
                      </div>
                      <div className={`py-2.5 px-3 text-[14px] text-right font-medium ${stock < m.pendingQty ? "text-red-600" : "text-green-700"}`}>
                        {stock.toLocaleString()}
                      </div>
                      <div className="py-2.5 px-3 text-[14px] text-right text-muted-foreground">
                        {m.issuedQty.toLocaleString()}
                      </div>
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
                            className={`h-7 text-[13px] text-right pr-2 ${isOverStock ? "border-red-400 focus-visible:ring-red-400" : ""}`}
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
