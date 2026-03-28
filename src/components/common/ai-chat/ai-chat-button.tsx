"use client"

import { useState, useEffect } from "react"
import { Bot, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AIChatPanel } from "./ai-chat-panel"
import { checkAIStatus } from "@/lib/actions/ai-chat.actions"

export function AIChatButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    checkAIStatus().then(({ enabled }) => setEnabled(enabled))
  }, [])

  if (!enabled) return null

  return (
    <>
      {/* 플로팅 버튼 — 패널 열릴 때 숨김 */}
      <Button
        size="icon"
        className={`fixed bottom-6 right-6 h-12 w-12 rounded-full shadow-lg z-40 transition-all duration-300 ${
          isOpen ? "opacity-0 pointer-events-none scale-90" : "opacity-100 scale-100"
        }`}
        onClick={() => setIsOpen(true)}
        title="AI 어시스턴트 열기"
      >
        <Bot className="w-5 h-5" />
      </Button>

      {/* 슬라이드 패널 — 항상 DOM에 있어야 애니메이션 작동 */}
      <AIChatPanel open={isOpen} onClose={() => setIsOpen(false)} />
    </>
  )
}
