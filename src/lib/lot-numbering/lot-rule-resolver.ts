import type { ItemType } from "@prisma/client"
import {
  fallbackRules,
  itemCategoryRules,
  itemCodeRules,
  itemGroupRules,
  itemTypeRules,
  type CnsLotEventType,
  type CnsLotRule,
} from "./cns-lot-rules"

export type CnsItemRuleContext = {
  itemCode?: string | null
  itemGroupCode?: string | null
  itemCategoryCode?: string | null
  itemType?: ItemType | string | null
}

export type ResolvedCnsLotRule = CnsLotRule & {
  source: "ITEM" | "ITEM_GROUP" | "ITEM_CATEGORY" | "ITEM_TYPE" | "FALLBACK"
}

function normalizeCode(code?: string | null): string | null {
  const trimmed = code?.trim()
  return trimmed ? trimmed.toUpperCase() : null
}

function getRule(
  rules: Record<string, Partial<Record<CnsLotEventType, CnsLotRule>>>,
  code: string | null,
  eventType: CnsLotEventType,
): CnsLotRule | null {
  if (!code) return null
  return rules[code]?.[eventType] ?? null
}

export function resolveCnsLotRule(
  context: CnsItemRuleContext,
  eventType: CnsLotEventType,
): ResolvedCnsLotRule {
  const itemCode = normalizeCode(context.itemCode)
  const itemGroupCode = normalizeCode(context.itemGroupCode)
  const itemCategoryCode = normalizeCode(context.itemCategoryCode)
  const itemType = normalizeCode(context.itemType)

  const itemRule = getRule(itemCodeRules, itemCode, eventType)
  if (itemRule) return { ...itemRule, source: "ITEM" }

  const itemGroupRule = getRule(itemGroupRules, itemGroupCode, eventType)
  if (itemGroupRule) return { ...itemGroupRule, source: "ITEM_GROUP" }

  const itemCategoryRule = getRule(itemCategoryRules, itemCategoryCode, eventType)
  if (itemCategoryRule) return { ...itemCategoryRule, source: "ITEM_CATEGORY" }

  const typeRule = itemTypeRules[itemType as ItemType]?.[eventType]
  if (typeRule) return { ...typeRule, source: "ITEM_TYPE" }

  return { ...fallbackRules[eventType], source: "FALLBACK" }
}
