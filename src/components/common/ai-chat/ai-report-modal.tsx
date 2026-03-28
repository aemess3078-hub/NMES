"use client"

import { useState } from "react"
import { FileDown, FileSpreadsheet, FileText, Printer, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { type Message } from "./ai-message"
import {
  exportToPDF,
  exportToExcel,
  exportToWord,
  exportToHWP,
  printMessages,
} from "./ai-export"

type Props = {
  open: boolean
  onClose: () => void
  messages: Message[]
  selectedIds?: Set<string>
}

export function AiReportModal({ open, onClose, messages, selectedIds }: Props) {
  const [isExporting, setIsExporting] = useState(false)

  const allMessages = messages.filter((m) => m.id !== "welcome")
  const selectedMessages =
    selectedIds && selectedIds.size > 0
      ? messages.filter((m) => selectedIds.has(m.id))
      : allMessages

  const target = selectedMessages.length > 0 ? selectedMessages : allMessages
  const userCount = target.filter((m) => m.role === "user").length
  const aiCount = target.filter((m) => m.role === "assistant").length

  const run = async (fn: () => void | Promise<void>) => {
    setIsExporting(true)
    try {
      await fn()
    } finally {
      setIsExporting(false)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[17px]">대화 리포트 생성</DialogTitle>
        </DialogHeader>

        {/* 요약 정보 */}
        <div className="rounded-xl bg-muted/40 px-4 py-3 text-[13px] space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>내보낼 범위</span>
            <span className="font-medium text-foreground">
              {selectedIds && selectedIds.size > 0
                ? `선택된 ${selectedIds.size}개 메시지`
                : "전체 대화"}
            </span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>사용자 질문</span>
            <span className="font-medium text-foreground">{userCount}건</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>AI 답변</span>
            <span className="font-medium text-foreground">{aiCount}건</span>
          </div>
        </div>

        {/* 내보내기 버튼 목록 */}
        <div className="space-y-2">
          <p className="text-[12px] text-muted-foreground">형식 선택</p>

          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-11 text-[14px]"
            disabled={isExporting}
            onClick={() => run(() => exportToPDF(target))}
          >
            <FileText className="w-4 h-4 text-red-500" />
            PDF로 저장
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-11 text-[14px]"
            disabled={isExporting}
            onClick={() => run(() => exportToExcel(target))}
          >
            <FileSpreadsheet className="w-4 h-4 text-green-600" />
            Excel로 저장
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-11 text-[14px]"
            disabled={isExporting}
            onClick={() => run(() => exportToWord(target))}
          >
            <FileText className="w-4 h-4 text-blue-600" />
            Word (.docx) 저장
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-11 text-[14px]"
            disabled={isExporting}
            onClick={() => run(() => exportToHWP(target))}
          >
            <FileText className="w-4 h-4 text-teal-600" />
            HWP 저장
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-11 text-[14px]"
            disabled={isExporting}
            onClick={() => run(() => printMessages(target))}
          >
            <Printer className="w-4 h-4" />
            인쇄
          </Button>
        </div>

        <Button variant="ghost" className="w-full text-muted-foreground text-[13px]" onClick={onClose}>
          취소
        </Button>
      </DialogContent>
    </Dialog>
  )
}
