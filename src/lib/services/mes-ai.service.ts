import { chatCompletion, jsonCompletion, isAIEnabled } from "./openai.service"
import { logAIUsage } from "./ai-usage.service"

const MES_SYSTEM_PROMPT = `당신은 NMES(클라우드 제조실행시스템)의 AI 어시스턴트입니다.
제조업 현장의 생산관리자, 품질관리자, 설비관리자를 돕습니다.

원칙:
1. 정확한 데이터에 기반하여 분석합니다.
2. 불확실한 내용은 반드시 "추가 확인 필요"로 표시합니다.
3. 제안은 근거(데이터)와 함께 제시합니다.
4. 위험한 결정(대량 발주, 설비 정지 등)은 반드시 사람의 확인을 권고합니다.
5. 한국어로 답변합니다.
6. 제조업 용어를 정확히 사용합니다.
7. 응답은 간결하되 핵심 근거를 포함합니다.`

export { isAIEnabled }

export async function analyzeMRPResult(tenantId: string, mrpData: unknown) {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini"
  const { data, usage } = await jsonCompletion<unknown>({
    systemPrompt: MES_SYSTEM_PROMPT + "\n\nMRP 소요량 계산 결과를 분석하고 최적의 발주 전략을 제안하세요. 반드시 JSON 형식으로 답변하세요.",
    userMessage: JSON.stringify(mrpData),
    model,
  })
  await logAIUsage({ tenantId, feature: "MRP_SUGGESTION", model, ...usage })
  return data
}

export async function analyzeEquipmentData(tenantId: string, equipmentData: unknown) {
  const model = process.env.OPENAI_MODEL_ADVANCED ?? "gpt-4o"
  const { data, usage } = await jsonCompletion<unknown>({
    systemPrompt: MES_SYSTEM_PROMPT + "\n\n설비 센서 데이터를 분석하고 이상 여부를 판단하세요. 원인 확률 순위와 권장 조치를 제시하세요. JSON으로 답변하세요.",
    userMessage: JSON.stringify(equipmentData),
    model,
  })
  await logAIUsage({ tenantId, feature: "ANOMALY_ANALYSIS", model, ...usage })
  return data
}

export async function predictMaintenance(tenantId: string, historyData: unknown) {
  const model = process.env.OPENAI_MODEL_ADVANCED ?? "gpt-4o"
  const { data, usage } = await jsonCompletion<unknown>({
    systemPrompt: MES_SYSTEM_PROMPT + "\n\n설비 이력 데이터를 분석하여 고장 확률을 예측하고 보전 일정을 추천하세요. JSON으로 답변하세요.",
    userMessage: JSON.stringify(historyData),
    model,
  })
  await logAIUsage({ tenantId, feature: "PREDICTIVE_MAINTENANCE", model, ...usage })
  return data
}

export async function analyzeClaim(tenantId: string, claimData: unknown) {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini"
  const { data, usage } = await jsonCompletion<unknown>({
    systemPrompt: MES_SYSTEM_PROMPT + "\n\n고객 클레임 내용과 관련 LOT 이력을 분석하여 원인 후보를 제시하세요. JSON으로 답변하세요.",
    userMessage: JSON.stringify(claimData),
    model,
  })
  await logAIUsage({ tenantId, feature: "CLAIM_ANALYSIS", model, ...usage })
  return data
}

export async function predictQuality(tenantId: string, processParams: unknown) {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini"
  const { data, usage } = await jsonCompletion<unknown>({
    systemPrompt: MES_SYSTEM_PROMPT + "\n\n공정 파라미터를 분석하여 품질 예측을 수행하세요. 불량 가능성과 주의 항목을 제시하세요. JSON으로 답변하세요.",
    userMessage: JSON.stringify(processParams),
    model,
  })
  await logAIUsage({ tenantId, feature: "QUALITY_PREDICTION", model, ...usage })
  return data
}

export async function naturalLanguageQuery(
  tenantId: string,
  question: string,
  context?: string
) {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini"
  const { content, usage } = await chatCompletion({
    systemPrompt:
      MES_SYSTEM_PROMPT +
      `\n\n사용자가 MES 시스템에 대해 질문합니다. 현재 페이지 컨텍스트: ${context ?? "일반"} 가능한 경우 구체적인 데이터나 수치를 포함하여 답변하세요. 데이터를 직접 조회할 수 없으므로, 어떤 화면에서 확인할 수 있는지 안내하세요.`,
    userMessage: question,
    model,
  })
  await logAIUsage({
    tenantId,
    feature: "NL_QUERY",
    model,
    ...usage,
    requestSummary: question.slice(0, 100),
  })
  return content
}
