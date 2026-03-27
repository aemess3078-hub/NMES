"use server"

import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"

// ─── Types ────────────────────────────────────────────────────────────────────

export type LotWithDetails = {
  id: string
  tenantId: string
  itemId: string
  lotNo: string
  status: string
  qty: any // Decimal (from InventoryBalance total, computed)
  manufactureDate: Date | null
  expiryDate: Date | null
  createdAt: Date
  item: {
    id: string
    code: string
    name: string
    itemType: string
    uom: string
    categoryId: string | null
  }
}

export type LotGenealogyNode = {
  id: string
  lotNo: string
  itemName: string
  itemCode: string
  status: string
  qty: any
  relationType: string | null // LotGenealogyRelation enum (루트는 null)
  children?: LotGenealogyNode[]
}

export type CreateLotInput = {
  itemId: string
  lotNo: string
  qty: number
  manufactureDate?: string | null
  expiryDate?: string | null
}

export type CreateLotRuleInput = {
  itemId: string
  prefix?: string | null
  dateFormat?: string | null
  seqLength: number
}

// ─── LOT 전체 조회 ────────────────────────────────────────────────────────────

export async function getLots(): Promise<LotWithDetails[]> {
  const lots = await prisma.lot.findMany({
    include: {
      item: {
        select: {
          id: true,
          code: true,
          name: true,
          itemType: true,
          uom: true,
          categoryId: true,
        },
      },
      inventoryBalances: {
        select: { qtyOnHand: true },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  return lots.map((lot) => {
    const totalQty = lot.inventoryBalances.reduce(
      (sum, b) => sum + Number(b.qtyOnHand),
      0
    )
    return {
      id: lot.id,
      tenantId: lot.tenantId,
      itemId: lot.itemId,
      lotNo: lot.lotNo,
      status: lot.status,
      qty: totalQty,
      manufactureDate: lot.manufactureDate,
      expiryDate: lot.expiryDate,
      createdAt: lot.createdAt,
      item: {
        id: lot.item.id,
        code: lot.item.code,
        name: lot.item.name,
        itemType: lot.item.itemType,
        uom: lot.item.uom,
        categoryId: lot.item.categoryId,
      },
    }
  }) as LotWithDetails[]
}

// ─── LOT 생성 ─────────────────────────────────────────────────────────────────

export async function createLot(data: CreateLotInput, tenantId: string) {
  const existing = await prisma.lot.findFirst({
    where: { tenantId, lotNo: data.lotNo },
  })
  if (existing) {
    throw new Error(`LOT번호 '${data.lotNo}'는 이미 존재합니다.`)
  }

  await prisma.lot.create({
    data: {
      tenantId,
      itemId: data.itemId,
      lotNo: data.lotNo,
      status: "ACTIVE",
      manufactureDate: data.manufactureDate ? new Date(data.manufactureDate) : null,
      expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
    },
  })

  revalidatePath("/app/mes/lot")
}

// ─── LOT 상태 변경 ────────────────────────────────────────────────────────────

export async function updateLotStatus(id: string, status: string) {
  await prisma.lot.update({
    where: { id },
    data: { status: status as any },
  })
  revalidatePath("/app/mes/lot")
}

// ─── LOT 번호 자동 생성 ───────────────────────────────────────────────────────

export async function generateLotNo(itemId: string, tenantId: string): Promise<string> {
  const rule = await prisma.lotRule.findFirst({
    where: { tenantId, itemId },
  })

  const today = new Date()
  const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, "")

  const prefix = rule?.prefix ?? "LOT"
  const seqLen = rule?.seqLength ?? 3

  // 오늘 날짜 기준 기존 번호 개수 확인
  const basePattern = `${prefix}-${yyyymmdd}`
  const count = await prisma.lot.count({
    where: {
      tenantId,
      lotNo: { startsWith: basePattern },
    },
  })

  const seq = String(count + 1).padStart(seqLen, "0")
  const candidate = `${prefix}-${yyyymmdd}-${seq}`

  // 중복 체크
  const dup = await prisma.lot.findFirst({
    where: { tenantId, lotNo: candidate },
  })
  if (dup) {
    // 중복이면 count+1 재시도
    const seq2 = String(count + 2).padStart(seqLen, "0")
    return `${prefix}-${yyyymmdd}-${seq2}`
  }

  return candidate
}

// ─── 재귀 정추적 헬퍼 ─────────────────────────────────────────────────────────

async function buildForwardTree(
  lotId: string,
  depth: number = 0
): Promise<LotGenealogyNode> {
  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
    include: { item: true },
  })
  if (!lot) throw new Error(`LOT not found: ${lotId}`)

  const totalQty = await prisma.inventoryBalance
    .aggregate({
      where: { lotId },
      _sum: { qtyOnHand: true },
    })
    .then((r) => Number(r._sum.qtyOnHand ?? 0))

  const node: LotGenealogyNode = {
    id: lot.id,
    lotNo: lot.lotNo,
    itemName: lot.item.name,
    itemCode: lot.item.code,
    status: lot.status,
    qty: totalQty,
    relationType: null,
    children: [],
  }

  if (depth >= 10) return node

  const genealogies = await prisma.lotGenealogy.findMany({
    where: { parentLotId: lotId },
    include: { childLot: { include: { item: true } } },
  })

  for (const g of genealogies) {
    const childNode = await buildForwardTree(g.childLotId, depth + 1)
    childNode.relationType = g.relationType
    node.children!.push(childNode)
  }

  return node
}

// ─── 재귀 역추적 헬퍼 ─────────────────────────────────────────────────────────

async function buildBackwardTree(
  lotId: string,
  depth: number = 0
): Promise<LotGenealogyNode> {
  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
    include: { item: true },
  })
  if (!lot) throw new Error(`LOT not found: ${lotId}`)

  const totalQty = await prisma.inventoryBalance
    .aggregate({
      where: { lotId },
      _sum: { qtyOnHand: true },
    })
    .then((r) => Number(r._sum.qtyOnHand ?? 0))

  const node: LotGenealogyNode = {
    id: lot.id,
    lotNo: lot.lotNo,
    itemName: lot.item.name,
    itemCode: lot.item.code,
    status: lot.status,
    qty: totalQty,
    relationType: null,
    children: [],
  }

  if (depth >= 10) return node

  const genealogies = await prisma.lotGenealogy.findMany({
    where: { childLotId: lotId },
    include: { parentLot: { include: { item: true } } },
  })

  for (const g of genealogies) {
    const parentNode = await buildBackwardTree(g.parentLotId, depth + 1)
    parentNode.relationType = g.relationType
    node.children!.push(parentNode)
  }

  return node
}

// ─── 정추적 (Forward): 이 LOT → 자식 LOT들 ──────────────────────────────────

export async function getLotForwardTrace(lotId: string): Promise<LotGenealogyNode> {
  return buildForwardTree(lotId, 0)
}

// ─── 역추적 (Backward): 이 LOT ← 부모 LOT들 ─────────────────────────────────

export async function getLotBackwardTrace(lotId: string): Promise<LotGenealogyNode> {
  return buildBackwardTree(lotId, 0)
}

// ─── LOT 검색 (Traceability 검색용) ──────────────────────────────────────────

export async function searchLotByNo(lotNo: string, tenantId: string) {
  return prisma.lot.findFirst({
    where: {
      tenantId,
      lotNo: { contains: lotNo },
    },
    include: { item: true },
  })
}

// ─── LOT 규칙 조회 ────────────────────────────────────────────────────────────

export async function getLotRules() {
  return prisma.lotRule.findMany({
    include: {
      item: {
        select: { id: true, code: true, name: true, itemType: true },
      },
    },
    orderBy: { item: { code: "asc" } },
  })
}

// ─── LOT 규칙 생성 ────────────────────────────────────────────────────────────

export async function createLotRule(data: CreateLotRuleInput, tenantId: string) {
  const existing = await prisma.lotRule.findFirst({
    where: { tenantId, itemId: data.itemId },
  })
  if (existing) {
    throw new Error("해당 품목에 이미 LOT 규칙이 존재합니다.")
  }

  await prisma.lotRule.create({
    data: {
      tenantId,
      itemId: data.itemId,
      prefix: data.prefix ?? null,
      dateFormat: data.dateFormat ?? null,
      seqLength: data.seqLength,
    },
  })

  revalidatePath("/app/mes/lot-rules")
}

// ─── LOT 규칙 수정 ────────────────────────────────────────────────────────────

export async function updateLotRule(id: string, data: Partial<CreateLotRuleInput>) {
  await prisma.lotRule.update({
    where: { id },
    data: {
      ...(data.itemId !== undefined && { itemId: data.itemId }),
      ...(data.prefix !== undefined && { prefix: data.prefix }),
      ...(data.dateFormat !== undefined && { dateFormat: data.dateFormat }),
      ...(data.seqLength !== undefined && { seqLength: data.seqLength }),
    },
  })
  revalidatePath("/app/mes/lot-rules")
}

// ─── LOT 규칙 삭제 ────────────────────────────────────────────────────────────

export async function deleteLotRule(id: string) {
  await prisma.lotRule.delete({ where: { id } })
  revalidatePath("/app/mes/lot-rules")
}

// ─── 품목 목록 (LOT 전용) ─────────────────────────────────────────────────────

export async function getItemsForLot() {
  return prisma.item.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      itemType: true,
      uom: true,
      categoryId: true,
    },
    where: { status: "ACTIVE" },
    orderBy: { code: "asc" },
  })
}

// ─── 사이트 목록 (LOT 전용) ───────────────────────────────────────────────────

export async function getSitesForLot() {
  return prisma.site.findMany({
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  })
}
