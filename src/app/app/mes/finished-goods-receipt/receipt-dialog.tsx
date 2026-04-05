"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { PackagePlus, CheckCircle2 } from "lucide-react"
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
import {
  WorkOrderForReceipt,
  WarehouseWithLocations,
  createFinishedGoodsReceiptAction,
} from "@/lib/actions/finished-goods.actions"
import { BarcodeScanInput, type ParsedBarcode } from "@/components/common/barcode/barcode-scan-input"
import { BarcodePrintDialog } from "@/components/common/barcode/barcode-print-dialog"

interface ReceiptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workOrder: WorkOrderForReceipt | null
  warehouses: WarehouseWithLocations[]
  tenantId: string
}

export function ReceiptDialog({
  open,
  onOpenChange,
  workOrder,
  warehouses,
  tenantId,
}: ReceiptDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [warehouseId, setWarehouseId] = useState("")
  const [locationId, setLocationId] = useState("")
  const [receiptQty, setReceiptQty] = useState("")
  const [scanVerified, setScanVerified] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)

  if (!workOrder) return null

  function handleScan(parsed: ParsedBarcode) {
    if (parsed.itemCode !== workOrder!.item.code) {
      alert(`스캔한 품목(${parsed.itemCode})이 작업지시 품목(${workOrder!.item.code})과 다릅니다.`)
      return
    }
    setScanVerified(true)
  }

  const selectedWarehouse = warehouses.find((wh) => wh.id === warehouseId)

  const handleWarehouseChange = (id: string) => {
    setWarehouseId(id)
    setLocationId("")
  }

  const handleOpen = (v: boolean) => {
    if (!v) {
      setWarehouseId("")
      setLocationId("")
      setReceiptQty("")
      setScanVerified(false)
    } else {
      setReceiptQty(String(workOrder.pendingQty))
    }
    onOpenChange(v)
  }

  const handleSubmit = () => {
    const qty = Number(receiptQty)
    if (isNaN(qty) || qty <= 0) {
      alert("입고 수량을 올바르게 입력하세요.")
      return
    }
    if (!warehouseId) {
      alert("창고를 선택하세요.")
      return
    }
    if (!locationId) {
      alert("로케이션을 선택하세요.")
      return
    }

    startTransition(async () => {
      const res = await createFinishedGoodsReceiptAction(
        {
          workOrderId: workOrder.id,
          itemId: workOrder.item.id,
          siteId: workOrder.site.id,
          warehouseId,
          locationId,
          receiptQty: qty,
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
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[18px]">
            <PackagePlus className="h-5 w-5 text-green-600" />
            완제품 입고 처리
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 바코드 스캔 검증 */}
          <div className="space-y-1">
            <p className="text-[13px] font-medium text-muted-foreground">완제품 바코드 스캔</p>
            {scanVerified ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-green-50 border border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-[13px] text-green-700 font-medium">품목 확인 완료 — [{workOrder.item.code}] {workOrder.item.name}</span>
              </div>
            ) : (
              <BarcodeScanInput
                onScan={handleScan}
                placeholder="완제품 바코드를 스캔하여 품목을 확인하세요 (선택)"
              />
            )}
          </div>

          {/* 작업지시 정보 */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-1">
            <div className="text-[13px] text-muted-foreground">작업지시</div>
            <div className="text-[15px] font-medium">{workOrder.orderNo}</div>
            <div className="text-[14px] text-muted-foreground">
              [{workOrder.item.code}] {workOrder.item.name}
            </div>
          </div>

          {/* 수량 요약 */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md border p-2">
              <div className="text-[12px] text-muted-foreground mb-0.5">양품생산</div>
              <div className="text-[16px] font-semibold">{workOrder.totalGoodQty}</div>
            </div>
            <div className="rounded-md border p-2">
              <div className="text-[12px] text-muted-foreground mb-0.5">기입고</div>
              <div className="text-[16px] font-semibold text-muted-foreground">
                {workOrder.totalReceiptQty}
              </div>
            </div>
            <div className="rounded-md border border-green-200 bg-green-50 p-2">
              <div className="text-[12px] text-green-700 mb-0.5">입고 가능</div>
              <div className="text-[16px] font-semibold text-green-700">
                {workOrder.pendingQty}
              </div>
            </div>
          </div>

          {/* 창고 선택 */}
          <div className="space-y-1.5">
            <Label className="text-[14px]">창고</Label>
            <Select value={warehouseId} onValueChange={handleWarehouseChange}>
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

          {/* 로케이션 선택 */}
          <div className="space-y-1.5">
            <Label className="text-[14px]">로케이션</Label>
            <Select
              value={locationId}
              onValueChange={setLocationId}
              disabled={!warehouseId}
            >
              <SelectTrigger className="text-[14px]">
                <SelectValue
                  placeholder={warehouseId ? "로케이션 선택" : "창고를 먼저 선택하세요"}
                />
              </SelectTrigger>
              <SelectContent>
                {selectedWarehouse?.locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id} className="text-[14px]">
                    [{loc.code}] {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 입고 수량 */}
          <div className="space-y-1.5">
            <Label className="text-[14px]">
              입고 수량{" "}
              <span className="text-muted-foreground font-normal">
                ({workOrder.item.uom})
              </span>
            </Label>
            <Input
              type="number"
              min={0.001}
              max={workOrder.pendingQty}
              step={1}
              value={receiptQty}
              onChange={(e) => setReceiptQty(e.target.value)}
              className="text-[14px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setPrintOpen(true)}
            className="mr-auto"
          >
            바코드 라벨 출력
          </Button>
          <Button
            variant="outline"
            onClick={() => handleOpen(false)}
            disabled={isPending}
          >
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !warehouseId || !locationId || !receiptQty}
            className="gap-1.5"
          >
            <PackagePlus className="h-4 w-4" />
            {isPending ? "처리 중..." : "입고 처리"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <BarcodePrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        title={`완제품 라벨 — ${workOrder.orderNo}`}
        items={[{
          itemCode: workOrder.item.code,
          itemName: workOrder.item.name,
          quantity: Number(receiptQty) || workOrder.pendingQty,
          uom: workOrder.item.uom,
        }]}
      />
    </Dialog>
  )
}
