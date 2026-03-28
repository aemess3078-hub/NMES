"use client"

import { useState, useEffect } from "react"
import { Bot } from "lucide-react"
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
      <Button
        size="icon"
        className="fixed bottom-6 right-6 h-12 w-12 rounded-full shadow-lg z-40"
        onClick={() => setIsOpen((v) => !v)}
        title="AI 어시스턴트"
      >
        <Bot className="w-5 h-5" />
      </Button>
      {isOpen && <AIChatPanel onClose={() => setIsOpen(false)} />}
    </>
  )
}
