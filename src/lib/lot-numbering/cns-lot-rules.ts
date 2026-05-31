import type { ItemType } from "@prisma/client"

export type CnsLotEventType =
  | "MATERIAL_RECEIPT"
  | "PRODUCTION_MANUFACTURING_NO"
  | "FINISHED_GOODS_RECEIPT"

export type CnsLotPattern =
  | "YY_MONTH_LETTER_DD_SEQ"
  | "PREFIX_YY_MONTH_LETTER_SEQ3"
  | "MANUAL_SUPPLIER_LOT"

export type CnsLotRule = {
  pattern: CnsLotPattern
  prefix?: string
  manualAllowed?: boolean
}

export type CnsLotRuleSet = Partial<Record<CnsLotEventType, CnsLotRule>>

export const fallbackRules: Record<CnsLotEventType, CnsLotRule> = {
  MATERIAL_RECEIPT: {
    pattern: "YY_MONTH_LETTER_DD_SEQ",
    manualAllowed: true,
  },
  PRODUCTION_MANUFACTURING_NO: {
    pattern: "PREFIX_YY_MONTH_LETTER_SEQ3",
    prefix: "C",
  },
  FINISHED_GOODS_RECEIPT: {
    pattern: "PREFIX_YY_MONTH_LETTER_SEQ3",
    prefix: "C",
  },
}

// TODO(CNS): Replace these placeholders with actual CNS item codes after master data is finalized.
export const itemCodeRules: Record<string, CnsLotRuleSet> = {}

// TODO(CNS): Add CNS item group codes that require CA-series production numbers.
// Example shape:
// BURR: {
//   PRODUCTION_MANUFACTURING_NO: { pattern: "PREFIX_YY_MONTH_LETTER_SEQ3", prefix: "CA" },
//   FINISHED_GOODS_RECEIPT: { pattern: "PREFIX_YY_MONTH_LETTER_SEQ3", prefix: "CA" },
// }
export const itemGroupRules: Record<string, CnsLotRuleSet> = {}

// TODO(CNS): Add CNS item category codes that require CA-series production numbers.
export const itemCategoryRules: Record<string, CnsLotRuleSet> = {}

export const itemTypeRules: Partial<Record<ItemType, CnsLotRuleSet>> = {
  RAW_MATERIAL: {
    MATERIAL_RECEIPT: {
      pattern: "YY_MONTH_LETTER_DD_SEQ",
      manualAllowed: true,
    },
  },
  SEMI_FINISHED: {
    PRODUCTION_MANUFACTURING_NO: {
      pattern: "PREFIX_YY_MONTH_LETTER_SEQ3",
      prefix: "C",
    },
    FINISHED_GOODS_RECEIPT: {
      pattern: "PREFIX_YY_MONTH_LETTER_SEQ3",
      prefix: "C",
    },
  },
  FINISHED: {
    PRODUCTION_MANUFACTURING_NO: {
      pattern: "PREFIX_YY_MONTH_LETTER_SEQ3",
      prefix: "C",
    },
    FINISHED_GOODS_RECEIPT: {
      pattern: "PREFIX_YY_MONTH_LETTER_SEQ3",
      prefix: "C",
    },
  },
}
