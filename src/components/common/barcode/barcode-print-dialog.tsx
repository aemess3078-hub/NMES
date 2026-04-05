"use client"

import { useRef } from "react"
import { useReactToPrint } from "react-to-print"
import { Printer, Download } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { BarcodeLabel } from "./barcode-label"

interface BarcodePrintItem {
  itemCode: string
  itemName: string
  lotId?: string
  quantity?: number
  uom?: string
}

interface BarcodePrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: BarcodePrintItem[]
  title?: string
}

/**
 * 바코드 라벨 출력 다이얼로그
 * 한 번에 여러 라벨 출력 가능
 */
export function BarcodePrintDialog({
  open,
  onOpenChange,
  items,
  title = "바코드 라벨 출력",
}: BarcodePrintDialogProps) {
  const printRef = useRef<HTMLDivElement>(null)
  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `바코드_${today}`,
    pageStyle: `
      @page { size: auto; margin: 8mm; }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-semibold">{title}</DialogTitle>
          <p className="text-[13px] text-muted-foreground">
            총 {items.length}개 라벨 · 프린터로 출력하거나 저장할 수 있습니다
          </p>
        </DialogHeader>

        {/* 미리보기 영역 */}
        <div className="max-h-[60vh] overflow-y-auto">
          <div
            ref={printRef}
            className="flex flex-wrap gap-3 p-4 bg-gray-50 rounded-md"
          >
            {items.map((item, i) => (
              <BarcodeLabel
                key={i}
                itemCode={item.itemCode}
                itemName={item.itemName}
                lotId={item.lotId}
                quantity={item.quantity}
                uom={item.uom}
                date={today}
              />
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button onClick={() => handlePrint()}>
            <Printer className="h-4 w-4 mr-2" />
            인쇄
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
