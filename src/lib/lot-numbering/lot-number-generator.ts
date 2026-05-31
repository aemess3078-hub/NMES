import type { Prisma } from "@prisma/client"
import { resolveCnsLotRule, type CnsItemRuleContext } from "./lot-rule-resolver"

type LotLookupClient = {
  lot: {
    findMany(args: Prisma.LotFindManyArgs): Promise<{ lotNo: string }[]>
  }
}

type WorkOrderLookupClient = {
  workOrder: {
    findMany(args: Prisma.WorkOrderFindManyArgs): Promise<{ manufacturingNo: string | null }[]>
  }
}

const MONTH_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const

export function getCnsMonthLetter(date: Date): string {
  return MONTH_LETTERS[date.getMonth()] ?? "A"
}

function getYear2(date: Date): string {
  return String(date.getFullYear()).slice(-2)
}

function getDay2(date: Date): string {
  return String(date.getDate()).padStart(2, "0")
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function maxParsedSequence(values: string[], pattern: RegExp): number {
  return values.reduce((max, value) => {
    const match = value.match(pattern)
    if (!match?.[1]) return max
    const seq = Number.parseInt(match[1], 10)
    return Number.isFinite(seq) ? Math.max(max, seq) : max
  }, 0)
}

export function formatCnsMaterialReceiptLotNo(date: Date, seq: number): string {
  return `${getYear2(date)}${getCnsMonthLetter(date)}${getDay2(date)}-${seq}`
}

export function formatCnsProductionNumber(prefix: string, date: Date, seq: number): string {
  if (seq > 999) {
    throw new Error("CNS production sequence exceeded 999 for the selected prefix/month")
  }
  return `${prefix}${getYear2(date)}${getCnsMonthLetter(date)}${String(seq).padStart(3, "0")}`
}

export async function generateCnsMaterialReceiptLotNo(
  db: LotLookupClient,
  tenantId: string,
  context: CnsItemRuleContext,
  date = new Date(),
  sequenceOffset = 0,
): Promise<string> {
  const rule = resolveCnsLotRule(context, "MATERIAL_RECEIPT")
  if (rule.pattern === "MANUAL_SUPPLIER_LOT") {
    throw new Error("LOT 번호를 직접 입력해야 하는 품목입니다.")
  }
  if (rule.pattern === "PREFIX_YY_MONTH_LETTER_SEQ3") {
    const prefix = rule.prefix?.trim().toUpperCase()
    if (!prefix) {
      throw new Error("생산 Prefix형 LOT 발행에는 Prefix가 필요합니다.")
    }
    const stem = `${prefix}${getYear2(date)}${getCnsMonthLetter(date)}`
    const existingLots = await db.lot.findMany({
      where: { tenantId, lotNo: { startsWith: stem } },
      select: { lotNo: true },
      take: 1000,
    })
    const pattern = new RegExp(`^${escapeRegExp(stem)}(\\d{3})$`)
    const nextSeq = maxParsedSequence(existingLots.map((lot) => lot.lotNo), pattern) + 1 + sequenceOffset
    return formatCnsProductionNumber(prefix, date, nextSeq)
  }

  const stem = `${getYear2(date)}${getCnsMonthLetter(date)}${getDay2(date)}-`
  const existingLots = await db.lot.findMany({
    where: { tenantId, lotNo: { startsWith: stem } },
    select: { lotNo: true },
    take: 1000,
  })
  const pattern = new RegExp(`^${escapeRegExp(stem)}(\\d+)$`)
  const nextSeq = maxParsedSequence(existingLots.map((lot) => lot.lotNo), pattern) + 1 + sequenceOffset
  return formatCnsMaterialReceiptLotNo(date, nextSeq)
}

export async function generateCnsManufacturingNo(
  db: WorkOrderLookupClient,
  tenantId: string,
  context: CnsItemRuleContext,
  date = new Date(),
  sequenceOffset = 0,
): Promise<string> {
  const rule = resolveCnsLotRule(context, "PRODUCTION_MANUFACTURING_NO")
  if (rule.pattern === "MANUAL_SUPPLIER_LOT") {
    throw new Error("제조번호를 직접 입력해야 하는 품목입니다.")
  }
  if (rule.pattern === "YY_MONTH_LETTER_DD_SEQ") {
    const stem = `${getYear2(date)}${getCnsMonthLetter(date)}${getDay2(date)}-`
    const existingWorkOrders = await db.workOrder.findMany({
      where: { tenantId, manufacturingNo: { startsWith: stem } },
      select: { manufacturingNo: true },
      take: 1000,
    })
    const pattern = new RegExp(`^${escapeRegExp(stem)}(\\d+)$`)
    const nextSeq =
      maxParsedSequence(
        existingWorkOrders
          .map((workOrder) => workOrder.manufacturingNo)
          .filter((value): value is string => Boolean(value)),
        pattern,
      ) +
      1 +
      sequenceOffset
    return formatCnsMaterialReceiptLotNo(date, nextSeq)
  }
  if (rule.source === "ITEM_SETTING" && !rule.prefix?.trim()) {
    throw new Error("생산 Prefix형 제조번호 발행에는 Prefix가 필요합니다.")
  }
  const prefix = rule.prefix?.trim().toUpperCase() || "C"
  const stem = `${prefix}${getYear2(date)}${getCnsMonthLetter(date)}`
  const existingWorkOrders = await db.workOrder.findMany({
    where: { tenantId, manufacturingNo: { startsWith: stem } },
    select: { manufacturingNo: true },
    take: 1000,
  })
  const pattern = new RegExp(`^${escapeRegExp(stem)}(\\d{3})$`)
  const nextSeq =
    maxParsedSequence(
      existingWorkOrders
        .map((workOrder) => workOrder.manufacturingNo)
        .filter((value): value is string => Boolean(value)),
      pattern,
    ) +
    1 +
    sequenceOffset

  return formatCnsProductionNumber(prefix, date, nextSeq)
}

export async function generateCnsFinishedGoodsLotNo(
  db: LotLookupClient,
  tenantId: string,
  context: CnsItemRuleContext,
  date = new Date(),
  sequenceOffset = 0,
): Promise<string> {
  const rule = resolveCnsLotRule(context, "FINISHED_GOODS_RECEIPT")
  if (rule.pattern === "MANUAL_SUPPLIER_LOT") {
    throw new Error("LOT 번호를 직접 입력해야 하는 품목입니다.")
  }
  if (rule.pattern === "YY_MONTH_LETTER_DD_SEQ") {
    const stem = `${getYear2(date)}${getCnsMonthLetter(date)}${getDay2(date)}-`
    const existingLots = await db.lot.findMany({
      where: { tenantId, lotNo: { startsWith: stem } },
      select: { lotNo: true },
      take: 1000,
    })
    const pattern = new RegExp(`^${escapeRegExp(stem)}(\\d+)$`)
    const nextSeq = maxParsedSequence(existingLots.map((lot) => lot.lotNo), pattern) + 1 + sequenceOffset
    return formatCnsMaterialReceiptLotNo(date, nextSeq)
  }
  if (rule.source === "ITEM_SETTING" && !rule.prefix?.trim()) {
    throw new Error("생산 Prefix형 LOT 발행에는 Prefix가 필요합니다.")
  }
  const prefix = rule.prefix?.trim().toUpperCase() || "C"
  const stem = `${prefix}${getYear2(date)}${getCnsMonthLetter(date)}`
  const existingLots = await db.lot.findMany({
    where: { tenantId, lotNo: { startsWith: stem } },
    select: { lotNo: true },
    take: 1000,
  })
  const pattern = new RegExp(`^${escapeRegExp(stem)}(\\d{3})$`)
  const nextSeq = maxParsedSequence(existingLots.map((lot) => lot.lotNo), pattern) + 1 + sequenceOffset
  return formatCnsProductionNumber(prefix, date, nextSeq)
}
