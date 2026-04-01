"use client"

import { useState, useEffect, useTransition } from "react"
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
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Loader2, PackageMinus, Factory, CheckCircle2, AlertTriangle } from "lucide-react"
import {
  checkInventoryForSalesOrder,
  requestProductionFromSalesOrder,
  type ItemStockStatus,
} from "@/lib/actions/sales-order.actions"
import {
  createShipment,
  getWarehouses,
} from "@/lib/actions/shipment.actions"
import type { SalesOrderRow } from "./columns"

interface SalesOrderProcessDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  salesOrder: SalesOrderRow | null
  tenantId: string
  siteId: string
}

export function SalesOrderProcessDialog({
  open,
  onOpenChange,
  salesOrder,
  tenantId,
  siteId,
}: SalesOrderProcessDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [loading, setLoading] = useState(false)
  const [stockStatus, setStockStatus] = useState<ItemStockStatus[]>([])
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; code: string }[]>([])
  const [warehouseId, setWarehouseId] = useState("")

  useEffect(() => {
    if (!open || !salesOrder) return
    setLoading(true)
    Promise.all([
      checkInventoryForSalesOrder(salesOrder.id, tenantId),
      getWarehouses(tenantId),
    ]).then(([stock, whs]) => {
      setStockStatus(stock)
      setWarehouses(whs)
      setLoading(false)
    })
  }, [open, salesOrder, tenantId])

  if (!salesOrder) return null

  const shippableItems = stockStatus.filter((s) => s.shippableQty > 0)
  const shortageItems = stockStatus.filter((s) => s.shortageQty > 0)
  const allFulfilled = stockStatus.length > 0 && stockStatus.every((s) => s.shortageQty === 0)

  const handleShipment = () => {
    if (!warehouseId) {
      alert("출하 창고를 선택하세요.")
      return
    }
    startTransition(async () => {
      const res = await createShipment(tenantId, siteId, {
        salesOrderId: salesOrder.id,
        plannedDate: new Date(),
        warehouseId,
        items: shippableItems.map((s) => ({
          salesOrderItemId: s.salesOrderItemId,
          itemId: s.itemId,
          qty: s.shippableQty,
        })),
      })
      router.refresh()
      onOpenChange(false)
    })
  }

  const handleProduction = () => {
    startTransition(async () => {
      const res = await requestProductionFromSalesOrder(
        salesOrder.id,
        shortageItems.map((s) => ({
          salesOrderItemId: s.salesOrderItemId,
          itemId: s.itemId,
          qty: s.shortageQty,
        })),
        tenantId,
        siteId
      )
      if (!res.ok) {
        alert(res.error ?? "오류가 발생했습니다.")
        return
      }
      alert(`생산계획 ${res.planNo} 이(가) 생성되었습니다.`)
      router.refresh()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-[18px]">수주 처리</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2 max-h-[70vh] overflow-y-auto">
          {/* 수주 정보 */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-1">
            <div className="text-[13px] text-muted-foreground">수주</div>
            <div className="text-[15px] font-medium">
              {salesOrder.orderNo}{" "}
              <span className="text-muted-foreground font-normal text-[14px]">
                — {salesOrder.customer.name}
              </span>
            </div>
            <div className="text-[13px] text-muted-foreground">
              납기일: {new Date(salesOrder.deliveryDate).toLocaleDateString("ko-KR")}
            </div>
          </div>

          {/* 재고 현황 테이블 */}
          <div className="space-y-2">
            <div className="text-[14px] font-medium">품목별 재고 현황</div>
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-[14px]">재고 조회 중...</span>
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <div className="grid grid-cols-[1fr_80px_80px_80px_80px_80px_80px] bg-muted/30 border-b">
                  {["품목명", "수주수량", "출하완료", "잔여수량", "가용재고", "출하가능", "부족수량"].map((h) => (
                    <div key={h} className="py-2 px-3 text-[13px] font-medium text-muted-foreground text-right first:text-left">
                      {h}
                    </div>
                  ))}
                </div>
                {stockStatus.map((s) => (
                  <div
                    key={s.salesOrderItemId}
                    className="grid grid-cols-[1fr_80px_80px_80px_80px_80px_80px] items-center border-b last:border-0 hover:bg-muted/10"
                  >
                    <div className="py-2.5 px-3">
                      <div className="text-[14px] font-medium">{s.itemName}</div>
                      <div className="text-[12px] text-muted-foreground font-mono">{s.itemCode} · {s.uom}</div>
                    </div>
                    <div className="py-2.5 px-3 text-[14px] text-right">{s.orderedQty.toLocaleString()}</div>
                    <div className="py-2.5 px-3 text-[14px] text-right text-muted-foreground">{s.shippedQty.toLocaleString()}</div>
                    <div className="py-2.5 px-3 text-[14px] text-right font-medium">{s.remainingQty.toLocaleString()}</div>
                    <div className={`py-2.5 px-3 text-[14px] text-right font-medium ${s.availableStock < s.remainingQty ? "text-amber-600" : "text-green-700"}`}>
                      {s.availableStock.toLocaleString()}
                    </div>
                    <div className="py-2.5 px-3 text-[14px] text-right text-green-700 font-medium">
                      {s.shippableQty > 0 ? s.shippableQty.toLocaleString() : "—"}
                    </div>
                    <div className={`py-2.5 px-3 text-[14px] text-right font-medium ${s.shortageQty > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                      {s.shortageQty > 0 ? s.shortageQty.toLocaleString() : "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* S3: 출하요청 생성 */}
          {!loading && shippableItems.length > 0 && (
            <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-[14px] font-medium text-green-800">
                  {allFulfilled ? "전체 출하 가능" : "일부 출하 가능"}
                </span>
                <Badge variant="outline" className="text-[12px] bg-green-100 text-green-700 border-green-200">
                  {shippableItems.length}개 품목
                </Badge>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[14px]">출하 창고</Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger className="text-[14px] max-w-xs">
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
              <Button
                size="sm"
                className="gap-1.5 bg-green-700 hover:bg-green-800"
                onClick={handleShipment}
                disabled={isPending || !warehouseId}
              >
                <PackageMinus className="h-3.5 w-3.5" />
                출하요청 생성
              </Button>
            </div>
          )}

          {/* S4: 생산의뢰 생성 */}
          {!loading && shortageItems.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span className="text-[14px] font-medium text-amber-800">재고 부족 — 생산의뢰 필요</span>
                <Badge variant="outline" className="text-[12px] bg-amber-100 text-amber-700 border-amber-200">
                  {shortageItems.length}개 품목
                </Badge>
              </div>
              <div className="text-[13px] text-amber-700">
                부족 수량에 대한 생산계획(DRAFT)이 생성되고, 수주 상태가 <strong>생산중</strong>으로 변경됩니다.
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-amber-400 text-amber-800 hover:bg-amber-100"
                onClick={handleProduction}
                disabled={isPending}
              >
                <Factory className="h-3.5 w-3.5" />
                생산의뢰 생성
              </Button>
            </div>
          )}

          {/* 이미 처리 완료 */}
          {!loading && stockStatus.length > 0 && shippableItems.length === 0 && shortageItems.length === 0 && (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 p-3">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-[14px] text-muted-foreground">모든 품목이 출하 완료되었습니다.</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
