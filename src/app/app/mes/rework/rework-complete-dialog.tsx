"use client"

import { useState, useTransition } from "react"
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
import { ReworkRow, completeRework } from "@/lib/actions/process-progress.actions"

interface ReworkCompleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reworkItem: ReworkRow | null
}

export function ReworkCompleteDialog({
  open,
  onOpenChange,
  reworkItem,
}: ReworkCompleteDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [goodQty, setGoodQty] = useState("")

  if (!reworkItem) return null

  const handleSubmit = () => {
    const qty = Number(goodQty)
    if (isNaN(qty) || qty <= 0) {
      alert("양품 수량을 올바르게 입력하세요.")
      return
    }
    if (qty > reworkItem.reworkQty) {
      alert(`재작업 수량(${reworkItem.reworkQty})을 초과할 수 없습니다.`)
      return
    }

    startTransition(async () => {
      const res = await completeRework(reworkItem.workOrderOperationId, qty)
      if (!res.ok) {
        alert(res.error ?? "오류가 발생했습니다.")
        return
      }
      router.refresh()
      onOpenChange(false)
      setGoodQty("")
    })
  }

  const handleClose = () => {
    onOpenChange(false)
    setGoodQty("")
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[18px]">재작업 완료 처리</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 공정 정보 */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-1">
            <div className="text-[13px] text-muted-foreground">공정</div>
            <div className="text-[15px] font-medium">
              {reworkItem.workOrder.orderNo} — {reworkItem.routingOperation.seq}.{" "}
              {reworkItem.routingOperation.name}
            </div>
            <div className="text-[14px] text-muted-foreground">
              {reworkItem.workOrder.item.name}
            </div>
          </div>

          {/* 재작업 수량 정보 */}
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-md border p-3">
              <div className="text-[13px] text-muted-foreground mb-1">원래 불량</div>
              <div className="text-[20px] font-semibold text-red-600">
                {reworkItem.defectQty}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-[13px] text-muted-foreground mb-1">재작업 대상</div>
              <div className="text-[20px] font-semibold text-amber-700">
                {reworkItem.reworkQty}
              </div>
            </div>
          </div>

          {/* 결과 입력 */}
          <div className="space-y-1.5">
            <Label className="text-[14px]">
              재작업 완료 후 양품 수량{" "}
              <span className="text-muted-foreground font-normal">
                (최대 {reworkItem.reworkQty})
              </span>
            </Label>
            <Input
              type="number"
              min={0}
              max={reworkItem.reworkQty}
              placeholder="0"
              value={goodQty}
              onChange={(e) => setGoodQty(e.target.value)}
              className="text-[14px]"
            />
          </div>

          {goodQty && Number(goodQty) >= 0 && (
            <div className="rounded-md bg-muted/30 p-3 text-[13px] text-muted-foreground">
              재작업 후 폐기:{" "}
              <span className="font-medium text-foreground">
                {Math.max(0, reworkItem.reworkQty - Number(goodQty))}개
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !goodQty}>
            {isPending ? "처리 중..." : "완료 처리"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
