"use client"

import { useState, useRef, useEffect } from "react"
import { usePathname } from "next/navigation"
import { X, Send, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AIMessage } from "./ai-message"
import { sendAIChatMessage } from "@/lib/actions/ai-chat.actions"

type Message = { role: "user" | "assistant"; content: string }

type Props = {
  onClose: () => void
}

export function AIChatPanel({ onClose }: Props) {
  const pathname = usePathname()
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "안녕하세요! NMES AI 어시스턴트입니다. 생산, 품질, 설비 관련 궁금한 점을 질문해 주세요.",
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    setInput("")
    setMessages((prev) => [...prev, { role: "user", content: trimmed }])
    setIsLoading(true)

    const result = await sendAIChatMessage(trimmed, pathname)

    setIsLoading(false)
    if (result.reply) {
      setMessages((prev) => [...prev, { role: "assistant", content: result.reply! }])
    } else if (result.error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `오류: ${result.error}` },
      ])
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="fixed bottom-20 right-6 w-[380px] h-[520px] bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-[14px] font-semibold leading-tight">NMES AI 어시스턴트</p>
            <p className="text-[11px] text-muted-foreground">gpt-4o-mini 기반</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <AIMessage key={i} message={msg} />
        ))}
        {isLoading && (
          <div className="flex gap-2 items-center">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="bg-muted rounded-2xl rounded-tl-sm px-3.5 py-2.5">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div className="px-3 py-3 border-t flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="질문을 입력하세요..."
          className="flex-1 text-[14px] bg-muted/40 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
          disabled={isLoading}
        />
        <Button
          size="icon"
          className="h-9 w-9 rounded-xl flex-shrink-0"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
