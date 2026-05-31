"use client"

import { useState, useEffect } from "react"
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
import { Badge } from "@/components/ui/badge"
import { createReceivingInspection, getWarehousesForSite } from "@/lib/actions/receiving.actions"
import { ReceivingInspectionResult } from "@prisma/client"
import type { MaterialReceiptOrderRow } from "./material-receipt-data-table"
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
  itemId: string
  itemCode: string
  itemName: string
  uom: string
  isLotTracked: boolean
  defaultWarehouseId: string | null
  warehouseId: string   // 품목별 입고창고 (사용자 변경 가능)
  orderedQty: number
  receivedQty: number
  pendingQty: number
  // 입력값
  thisReceivedQty: string
  thisAcceptedQty: string
  thisRejectedQty: string
  result: ReceivingInspectionResult
  note: string
  lotNo: string   // 비워두면 isLotTracked 시 자동생성, 비LOT 품목은 미할당
}

const RESULT_OPTIONS: { label: string; value: ReceivingInspectionResult }[] = [
  { label: "합격", value: "PASS" },
  { label: "불합격", value: "FAIL" },
  { label: "조건부합격", value: "CONDITIONAL" },
]

// ─── Component ────────────────────────────────────────────────────────────────

type Warehouse = { id: string; code: string; name: string }

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
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])

  const [inspections, setInspections] = useState<ItemInspection[]>(() =>
    purchaseOrder.items.map((oi) => {
      const orderedQty = Number(oi.qty)
      const receivedQty = Number(oi.receivedQty)
      const pendingQty = Math.max(0, orderedQty - receivedQty)
      return {
        purchaseOrderItemId: oi.id,
        itemId: oi.item.id,
        itemCode: oi.item.code,
        itemName: oi.item.name,
        uom: oi.item.uom,
        isLotTracked: oi.item.isLotTracked ?? false,
        defaultWarehouseId: oi.item.defaultWarehouseId ?? null,
        warehouseId: "",
        orderedQty,
        receivedQty,
        pendingQty,
        thisReceivedQty: String(pendingQty),
        thisAcceptedQty: String(pendingQty),
        thisRejectedQty: "0",
        result: "PASS",
        note: "",
        lotNo: "",
      }
    })
  )

  // 창고 로드 후 품목별 기본창고 적용
  //  - 품목의 defaultWarehouseId가 현재 입고 site 창고 목록에 있으면 우선 사용
  //  - 없으면(다른 site이거나 미지정) 현재 site의 첫 번째 창고로 fallback
  useEffect(() => {
    if (!open || !siteId) return
    getWarehousesForSite(siteId).then((whs) => {
      setWarehouses(whs)
      const whIds = new Set(whs.map((w) => w.id))
      const fallback = whs[0]?.id ?? ""
      setInspections((prev) =>
        prev.map((ins) => ({
          ...ins,
          warehouseId:
            ins.defaultWarehouseId && whIds.has(ins.defaultWarehouseId)
              ? ins.defaultWarehouseId
              : fallback,
        })),
      )
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, siteId])

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

    // 클라이언트 검증
    for (const ins of inspections) {
      const received = parseFloat(ins.thisReceivedQty) || 0
      if (received <= 0) continue

      if (received > ins.pendingQty) {
        alert(
          `[${ins.itemCode}] ${ins.itemName}\n` +
          `입고수량(${received.toLocaleString()})이 잔여수량(${ins.pendingQty.toLocaleString()} ${ins.uom})을 초과합니다.`
        )
        return
      }

      const accepted = parseFloat(ins.thisAcceptedQty) || 0
      const rejected = parseFloat(ins.thisRejectedQty) || 0
      if (Math.abs(accepted + rejected - received) > 0.001) {
        alert(
          `[${ins.itemCode}] ${ins.itemName}\n` +
          `합격수량과 불합격수량의 합은 금회 입고수량과 같아야 합니다.`
        )
        return
      }

      if (!ins.warehouseId) {
        alert(`[${ins.itemCode}] ${ins.itemName}\n입고 창고를 선택해 주세요.`)
        return
      }
    }

    setIsLoading(true)
    try {
      for (const ins of inspections) {
        const received = parseFloat(ins.thisReceivedQty) || 0
        if (received <= 0) continue

        await createReceivingInspection({
          purchaseOrderItemId: ins.purchaseOrderItemId,
          purchaseOrderId: purchaseOrder.id,
          warehouseId: ins.warehouseId,
          siteId,
          receivedQty: received,
          acceptedQty: parseFloat(ins.thisAcceptedQty) || 0,
          rejectedQty: parseFloat(ins.thisRejectedQty) || 0,
          result: ins.result,
          note: ins.note || undefined,
          lotNo: ins.lotNo.trim() || undefined,
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

        {/* 창고 안내 — 입고창고는 품목별로 지정 */}
        {warehouses.length === 0 ? (
          <p className="text-[13px] text-destructive">
            이 사이트에 등록된 창고가 없습니다. 로케이션 관리에서 창고를 먼저 추가해주세요.
          </p>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            입고 창고는 품목별로 지정합니다. 품목에 기본 입고창고가 설정되어 있고 현재 입고 사이트와 같으면 자동 선택됩니다.
          </p>
        )}

        <div className="space-y-5 py-2">
          {inspections.map((ins, index) => (
            <div
              key={ins.purchaseOrderItemId}
              className="rounded-lg border bg-card p-4 space-y-4"
            >
              {/* 품목 헤더 */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-[15px] font-medium">
                      [{ins.itemCode}] {ins.itemName}
                    </p>
                    {ins.isLotTracked && (
                      <Badge variant="outline" className="text-[11px] border-blue-300 text-blue-700 bg-blue-50 px-1.5 py-0">
                        LOT 관리
                      </Badge>
                    )}
                  </div>
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
              </div>

              {/* LOT 번호 입력 — LOT 관리 품목만 표시 */}
              {ins.isLotTracked && (
                <div className="space-y-1.5">
                  <Label className="text-[13px]">
                    LOT 번호
                    <span className="ml-1 text-[11px] text-blue-600 font-normal">
                      (미입력 시 자동 발행)
                    </span>
                  </Label>
                  <Input
                    type="text"
                    value={ins.lotNo}
                    onChange={(e) => updateInspection(index, { lotNo: e.target.value })}
                    placeholder="비워두면 LOT-YYYYMMDD-NNN 형식으로 자동 발행됩니다"
                    className="h-8 text-[13px] font-mono"
                  />
                  {!ins.lotNo && (
                    <p className="text-[12px] text-muted-foreground">
                      미입력 시 LOT-YYYYMMDD-NNN 형식으로 자동 발행됩니다.
                    </p>
                  )}
                </div>
              )}

              {/* 품목별 입고창고 */}
              <div className="space-y-1.5">
                <Label className="text-[13px]">
                  입고 창고 <span className="text-destructive">*</span>
                  {ins.defaultWarehouseId &&
                    warehouses.some((w) => w.id === ins.defaultWarehouseId) &&
                    ins.warehouseId === ins.defaultWarehouseId && (
                      <span className="ml-1.5 text-[11px] font-normal text-blue-600">
                        품목 기본창고 적용됨
                      </span>
                    )}
                </Label>
                <Select
                  value={ins.warehouseId}
                  onValueChange={(v) => updateInspection(index, { warehouseId: v })}
                  disabled={warehouses.length === 0}
                >
                  <SelectTrigger className="h-8 text-[13px]">
                    <SelectValue placeholder="창고 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((wh) => (
                      <SelectItem key={wh.id} value={wh.id} className="text-[13px]">
                        [{wh.code}] {wh.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 수량 입력 */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[13px]">
                    금회 입고수량
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                      (최대 {ins.pendingQty.toLocaleString()} {ins.uom})
                    </span>
                  </Label>
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
                    className={`h-8 text-[13px] ${(parseFloat(ins.thisReceivedQty) || 0) > ins.pendingQty ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                  />
                  {(parseFloat(ins.thisReceivedQty) || 0) > ins.pendingQty && (
                    <p className="text-[12px] text-red-600">
                      잔여수량 {ins.pendingQty.toLocaleString()} {ins.uom} 초과
                    </p>
                  )}
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
          <Button
            onClick={handleConfirm}
            disabled={
              isLoading ||
              warehouses.length === 0 ||
              inspections.some(
                (ins) =>
                  (parseFloat(ins.thisReceivedQty) || 0) > ins.pendingQty ||
                  ((parseFloat(ins.thisReceivedQty) || 0) > 0 && !ins.warehouseId),
              )
            }
          >
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
