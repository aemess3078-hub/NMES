"use server"

import { requireTenantContext } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"
import { generateNumber } from "./numbering-rule.actions"

export type LotWithDetails = {
  id: string
  tenantId: string
  itemId: string
  lotNo: string
  status: string
  qty: any
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
  relationType: string | null
  children?: LotGenealogyNode[]
}

export type CreateLotInput = {
  itemId: string
  lotNo: string
  qty: number
  manufactureDate?: string | null
  expiryDate?: string | null
}

export async function getLots(): Promise<LotWithDetails[]> {
  const { tenantId } = await requireTenantContext()
  const lots = await prisma.lot.findMany({
    where: { tenantId },
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

export async function createLot(data: CreateLotInput, _tenantId?: string) {
  const { tenantId } = await requireTenantContext()
  const [existing, item] = await Promise.all([
    prisma.lot.findFirst({ where: { tenantId, lotNo: data.lotNo } }),
    prisma.item.findFirst({ where: { id: data.itemId, tenantId }, select: { id: true } }),
  ])
  if (existing) {
    throw new Error(`LOT '${data.lotNo}' already exists`)
  }
  if (!item) {
    throw new Error("Item not found in tenant scope")
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

export async function updateLotStatus(id: string, status: string) {
  const { tenantId } = await requireTenantContext()
  const result = await prisma.lot.updateMany({
    where: { id, tenantId },
    data: { status: status as any },
  })
  if (result.count === 0) throw new Error("Lot not found in tenant scope")
  revalidatePath("/app/mes/lot")
}

export async function generateLotNo(itemId: string, _tenantId?: string): Promise<string> {
  const { tenantId } = await requireTenantContext()
  const item = await prisma.item.findFirst({
    where: { id: itemId, tenantId },
    select: { code: true, itemType: true },
  })
  const context = {
    ITEM_CODE: item?.code,
    ITEM_TYPE: item?.itemType,
  }
  return generateNumber(tenantId, "LOT", context as any)
}

async function buildForwardTree(
  lotId: string,
  tenantId: string,
  depth: number = 0
): Promise<LotGenealogyNode> {
  const lot = await prisma.lot.findFirst({
    where: { id: lotId, tenantId },
    include: { item: true },
  })
  if (!lot) throw new Error(`LOT not found: ${lotId}`)

  const totalQty = await prisma.inventoryBalance
    .aggregate({
      where: { lotId, tenantId },
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
    where: { parentLotId: lotId, parentLot: { tenantId }, childLot: { tenantId } },
  })

  for (const g of genealogies) {
    const childNode = await buildForwardTree(g.childLotId, tenantId, depth + 1)
    childNode.relationType = g.relationType
    node.children!.push(childNode)
  }

  return node
}

async function buildBackwardTree(
  lotId: string,
  tenantId: string,
  depth: number = 0
): Promise<LotGenealogyNode> {
  const lot = await prisma.lot.findFirst({
    where: { id: lotId, tenantId },
    include: { item: true },
  })
  if (!lot) throw new Error(`LOT not found: ${lotId}`)

  const totalQty = await prisma.inventoryBalance
    .aggregate({
      where: { lotId, tenantId },
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
    where: { childLotId: lotId, parentLot: { tenantId }, childLot: { tenantId } },
  })

  for (const g of genealogies) {
    const parentNode = await buildBackwardTree(g.parentLotId, tenantId, depth + 1)
    parentNode.relationType = g.relationType
    node.children!.push(parentNode)
  }

  return node
}

export async function getLotForwardTrace(lotId: string): Promise<LotGenealogyNode> {
  const { tenantId } = await requireTenantContext()
  return buildForwardTree(lotId, tenantId, 0)
}

export async function getLotBackwardTrace(lotId: string): Promise<LotGenealogyNode> {
  const { tenantId } = await requireTenantContext()
  return buildBackwardTree(lotId, tenantId, 0)
}

export async function searchLotByNo(lotNo: string, _tenantId?: string) {
  const { tenantId } = await requireTenantContext()
  return prisma.lot.findFirst({
    where: {
      tenantId,
      lotNo: { contains: lotNo },
    },
    include: { item: true },
  })
}

export async function getItemsForLot() {
  const { tenantId } = await requireTenantContext()
  return prisma.item.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      itemType: true,
      uom: true,
      categoryId: true,
    },
    where: { tenantId, status: "ACTIVE" },
    orderBy: { code: "asc" },
  })
}

export async function getSitesForLot() {
  const { tenantId } = await requireTenantContext()
  return prisma.site.findMany({
    where: { tenantId },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  })
}
