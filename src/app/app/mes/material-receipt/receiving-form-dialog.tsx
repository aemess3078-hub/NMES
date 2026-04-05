"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createReceivingInspection } from "@/lib/actions/receiving.actions"
import { ReceivingInspectionResult } from "@prisma/client"
import type { MaterialReceiptOrderRow } from "./material-receipt-data-table"
import { BarcodeScanInput, type ParsedBarcode } from "@/components/common/barcode/barcode-scan-input"
import { BarcodePrintDialog } from "@/components/common/barcode/barcode-print-dialog"

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReceivingFormDialogProps {
  purchaseOrder: MaterialReceiptOrderRow
  tenantId: string
  siteId: string
  open: boolean
  onClose: () => void
}

type ItemInspection = {
  purchaseOrderItemId: string
  itemCode: string
  itemName: string
  uom: string
  orderedQty: number
  receivedQty: number
  pendingQty: number
  // 입력값
  thisReceivedQty: string
  thisAcceptedQty: string
  thisRejectedQty: string
  result: ReceivingInspectionResult
  note: string
}

const RESULT_OPTIONS: { label: string; value: ReceivingInspectionResult }[] = [
  { label: "합격", value: "PASS" },
  { label: "불합격", value: "FAIL" },
  { label: "조건부합격", value: "CONDITIONAL" },
]

// ─── Component ────────────────────────────────────────────────────────────────

export function ReceivingFormDialog({
  purchaseOrder,
  tenantId,
  siteId,
  open,
  onClose,
}: ReceivingFormDialogProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  const [inspections, setInspections] = useState<ItemInspection[]>(() =>
    purchaseOrder.items.map((oi) => {
      const orderedQty = Number(oi.qty)
      const receivedQty = Number(oi.receivedQty)
      const pendingQty = Math.max(0, orderedQty - receivedQty)
      return {
        purchaseOrderItemId: oi.id,
        itemCode: oi.item.code,
        itemName: oi.item.name,
        uom: oi.item.uom,
        orderedQty,
        receivedQty,
        pendingQty,
        thisReceivedQty: String(pendingQty),
        thisAcceptedQty: String(pendingQty),
        thisRejectedQty: "0",
        result: "PASS",
        note: "",
      }
    })
  )

  function handleScan(parsed: ParsedBarcode) {
    const idx = inspections.findIndex(
      (ins) => ins.itemCode === parsed.itemCode
    )
    if (idx === -1) {
      alert(`품목 코드 "${parsed.itemCode}"가 이 발주에 없습니다.`)
      return
    }
    setHighlightedIndex(idx)
    // 해당 품목 행으로 스크롤
    itemRefs.current[idx]?.scrollIntoView({ behavior: "smooth", block: "center" })
    // 3초 후 하이라이트 해제
    setTimeout(() => setHighlightedIndex(null), 3000)
  }

  function updateInspection(index: number, patch: Partial<ItemInspection>) {
    setInspections((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item))
    )
  }

  async function handleConfirm() {
    const hasAny = inspections.some((ins) => (parseFloat(ins.thisReceivedQty) || 0) > 0)
    if (!hasAny) {
      alert("입고수량을 1 이상 입력해주세요.")
      return
    }

    setIsLoading(true)
    try {
      for (const ins of inspections) {
        const received = parseFloat(ins.thisReceivedQty) || 0
        if (received <= 0) continue

        await createReceivingInspection({
          purchaseOrderItemId: ins.purchaseOrderItemId,
          purchaseOrderId: purchaseOrder.id,
          tenantId,
          siteId,
          receivedQty: received,
          acceptedQty: parseFloat(ins.thisAcceptedQty) || 0,
          rejectedQty: parseFloat(ins.thisRejectedQty) || 0,
          result: ins.result,
          note: ins.note || undefined,
        })
      }
      onClose()
      router.refresh()
    } catch (error) {
      console.error("입고 처리 실패:", error)
      alert(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-semibold">
            입고 처리 — {purchaseOrder.orderNo}
          </DialogTitle>
          <p className="text-[13px] text-muted-foreground mt-1">
            {purchaseOrder.supplier.name} · 발주품목 {purchaseOrder.items.length}건
          </p>
        </DialogHeader>

        {/* 바코드 스캔 */}
        <div className="space-y-1">
          <p className="text-[13px] font-medium text-muted-foreground">바코드 스캔</p>
          <BarcodeScanInput
            onScan={handleScan}
            placeholder="품목 바코드를 스캔하면 해당 행으로 이동합니다"
          />
        </div>

        <div className="space-y-5 py-2">
          {inspections.map((ins, index) => (
            <div
              key={ins.purchaseOrderItemId}
              ref={(el) => { itemRefs.current[index] = el }}
              className={`rounded-lg border p-4 space-y-4 transition-colors duration-300 ${
                highlightedIndex === index
                  ? "border-green-400 bg-green-50"
                  : "bg-card"
              }`}
            >
              {/* 품목 헤더 */}
              <div>
                <p className="text-[15px] font-medium">
                  [{ins.itemCode}] {ins.itemName}
                </p>
                <div className="flex gap-4 mt-1">
                  <span className="text-[13px] text-muted-foreground">
                    발주 <span className="font-medium text-foreground">{ins.orderedQty.toLocaleString()}</span> {ins.uom}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    기입고 <span className="font-medium text-foreground">{ins.receivedQty.toLocaleString()}</span> {ins.uom}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    잔여 <span className={`font-medium ${ins.pendingQty > 0 ? "text-amber-600" : "text-green-600"}`}>
                      {ins.pendingQty.toLocaleString()}
                    </span> {ins.uom}
                  </span>
                </div>
              </div>

              {/* 수량 입력 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[13px]">금회 입고수량</Label>
                  <Input
                    type="number"
                    min={0}
                    max={ins.pendingQty}
                    step={1}
                    value={ins.thisReceivedQty}
                    onChange={(e) => {
                      const v = e.target.value
                      updateInspection(index, {
                        thisReceivedQty: v,
                        thisAcceptedQty: v,
                        thisRejectedQty: "0",
                      })
                    }}
                    className="h-8 text-[13px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px]">합격수량</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={ins.thisAcceptedQty}
                    onChange={(e) => {
                      const accepted = parseFloat(e.target.value) || 0
                      const received = parseFloat(ins.thisReceivedQty) || 0
                      updateInspection(index, {
                        thisAcceptedQty: e.target.value,
                        thisRejectedQty: String(Math.max(0, received - accepted)),
                      })
                    }}
                    className="h-8 text-[13px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px]">불합격수량</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={ins.thisRejectedQty}
                    readOnly
                    className="h-8 text-[13px] bg-muted/50 cursor-not-allowed"
                  />
                </div>
              </div>

              {/* 판정 + 비고 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[13px]">검사 판정</Label>
                  <Select
                    value={ins.result}
                    onValueChange={(v) =>
                      updateInspection(index, { result: v as ReceivingInspectionResult })
                    }
                  >
                    <SelectTrigger className="h-8 text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESULT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-[13px]">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px]">비고</Label>
                  <Textarea
                    value={ins.note}
                    onChange={(e) => updateInspection(index, { note: e.target.value })}
                    className="h-8 text-[13px] resize-none min-h-0"
                    placeholder="비고 입력 (선택)"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="pt-2 flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setPrintOpen(true)}
            className="mr-auto"
          >
            바코드 라벨 출력
          </Button>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            취소
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? "처리 중..." : "입고 확정"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* 바코드 라벨 출력 다이얼로그 */}
      <BarcodePrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        title={`바코드 라벨 — ${purchaseOrder.orderNo}`}
        items={inspections.map((ins) => ({
          itemCode: ins.itemCode,
          itemName: ins.itemName,
          quantity: parseFloat(ins.thisReceivedQty) || ins.pendingQty,
          uom: ins.uom,
        }))}
      />
    </Dialog>
  )
}
