"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { usePathname } from "next/navigation"
import {
  X, Send, Bot, FileDown, FileSpreadsheet,
  FileText, Printer, ChevronDown, CheckSquare, Square,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AIMessage, type Message } from "./ai-message"
import { sendAIChatMessage } from "@/lib/actions/ai-chat.actions"
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
}

export function AIChatPanel({ open, onClose }: Props) {
  const pathname = usePathname()
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "안녕하세요! NMES AI 어시스턴트입니다.\n생산, 품질, 설비 관련 궁금한 점을 질문해 주세요.\n\n💡 AI 답변에 마우스를 올리면 체크박스가 나타납니다. 선택 후 원하는 형식으로 내보낼 수 있습니다.",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isExporting, setIsExporting] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    }
    setInput("")
    setMessages((prev) => [...prev, userMsg])
    setIsLoading(true)

    const result = await sendAIChatMessage(trimmed, pathname)
    setIsLoading(false)

    const aiMsg: Message = {
      id: `a-${Date.now()}`,
      role: "assistant",
      content: result.reply ?? `오류: ${result.error}`,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, aiMsg])
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const assistantMessages = messages.filter((m) => m.role === "assistant" && m.id !== "welcome")
  const selectedMessages = messages.filter((m) => selectedIds.has(m.id))
  const exportTarget = selectedMessages.length > 0 ? selectedMessages : messages.filter((m) => m.id !== "welcome")

  const handleSelectAll = () => {
    if (selectedIds.size === assistantMessages.length && assistantMessages.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(assistantMessages.map((m) => m.id)))
    }
  }

  const runExport = async (fn: () => void | Promise<void>) => {
    setIsExporting(true)
    try { await fn() } finally { setIsExporting(false) }
  }

  return (
    <>
      {/* 백드롭 */}
      <div
        className={`fixed inset-0 bg-black/20 z-40 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* 슬라이드 패널 */}
      <div
        className={`fixed top-0 right-0 h-full bg-background border-l shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out
          w-[30vw] min-w-[360px] max-w-[600px]
          ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* ── 헤더 ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-muted/20 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-[15px] font-semibold leading-tight">NMES AI 어시스턴트</p>
              <p className="text-[11px] text-muted-foreground">
                gpt-4o-mini · 대화 {Math.max(0, messages.length - 1)}건
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* 내보내기 드롭다운 */}
            {messages.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-[13px] px-2.5"
                    disabled={isExporting}
                  >
                    <FileDown className="w-4 h-4" />
                    내보내기
                    {selectedIds.size > 0 && (
                      <span className="bg-primary text-primary-foreground text-[11px] rounded-full px-1.5 leading-5 min-w-[20px] text-center">
                        {selectedIds.size}
                      </span>
                    )}
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <div className="px-2 py-1.5 text-[12px] text-muted-foreground">
                    {selectedIds.size > 0
                      ? `선택된 ${selectedIds.size}개 메시지 내보내기`
                      : "전체 대화 내보내기"}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => runExport(() => exportToPDF(exportTarget))}
                  >
                    <FileText className="mr-2 h-4 w-4 text-red-500" />
                    PDF로 저장
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => runExport(() => exportToExcel(exportTarget))}
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4 text-green-600" />
                    Excel로 저장
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => runExport(() => exportToWord(exportTarget))}
                  >
                    <FileText className="mr-2 h-4 w-4 text-blue-600" />
                    Word (.docx) 저장
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => runExport(() => exportToHWP(exportTarget))}
                  >
                    <FileText className="mr-2 h-4 w-4 text-teal-600" />
                    HWP 저장
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => printMessages(exportTarget)}>
                    <Printer className="mr-2 h-4 w-4" />
                    인쇄
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* ── 선택 도구모음 ── */}
        {assistantMessages.length > 0 && (
          <div className="px-5 py-2 border-b bg-muted/10 flex items-center gap-3 flex-shrink-0">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {selectedIds.size === assistantMessages.length && assistantMessages.length > 0
                ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
                : <Square className="w-3.5 h-3.5" />
              }
              {selectedIds.size > 0 ? `${selectedIds.size}개 선택됨` : "AI 답변 전체 선택"}
            </button>
            {selectedIds.size > 0 && (
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-[12px] text-muted-foreground/70 hover:text-foreground transition-colors"
              >
                선택 해제
              </button>
            )}
          </div>
        )}

        {/* ── 메시지 목록 ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((msg) => (
            <AIMessage
              key={msg.id}
              message={msg}
              selected={selectedIds.has(msg.id)}
              onToggleSelect={msg.id === "welcome" ? () => {} : toggleSelect}
            />
          ))}

          {/* 로딩 인디케이터 */}
          {isLoading && (
            <div className="flex gap-2 items-start">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mt-0.5 flex-shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1.5 items-center">
                  <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* ── 입력창 ── */}
        <div className="px-4 py-4 border-t bg-muted/10 flex-shrink-0">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="질문을 입력하세요... (Enter 전송)"
              className="flex-1 text-[14px] bg-background border rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
              disabled={isLoading}
            />
            <Button
              size="icon"
              className="h-10 w-10 rounded-xl flex-shrink-0"
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground/40 mt-2 text-center">
            AI 답변에 마우스를 올려 선택 후 내보내기 가능
          </p>
        </div>
      </div>
    </>
  )
}
