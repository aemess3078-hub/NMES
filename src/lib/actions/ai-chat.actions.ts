"use server"

import { naturalLanguageQuery, isAIEnabled } from "@/lib/services/mes-ai.service"

export async function sendAIChatMessage(message: string, context?: string) {
  const tenantId = "tenant-demo-001"
  if (!isAIEnabled()) {
    return { error: "AI 기능이 비활성화되어 있습니다." }
  }
  try {
    const reply = await naturalLanguageQuery(tenantId, message, context)
    return { reply }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "AI 응답 실패"
    return { error: msg }
  }
}

export async function checkAIStatus() {
  return { enabled: isAIEnabled() }
}
