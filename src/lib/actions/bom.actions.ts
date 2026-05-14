"use server"

import { requireTenantContext } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { BOMStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"

export type BOMWithDetails = {
  id: string
  tenantId: string
  itemId: string
  version: string
  isDefault: boolean
  status: BOMStatus
  createdAt: Date
  updatedAt: Date
  item: {
    id: string
    code: string
    name: string
    itemType: string
    category: { id: string; name: string } | null
  }
  bomItems: {
    id: string
    bomId: string
    componentItemId: string
    seq: number
    qtyPer: number
    scrapRate: number
    componentItem: {
      id: string
      code: string
      name: string
      itemType: string
      uom: string
    }
  }[]
}

function serializeBom(bom: any): BOMWithDetails {
  return {
    ...bom,
    bomItems: bom.bomItems.map((bi: any) => ({
      ...bi,
      qtyPer: Number(bi.qtyPer),
      scrapRate: Number(bi.scrapRate),
    })),
  }
}

export async function getBoms(): Promise<BOMWithDetails[]> {
  const { tenantId } = await requireTenantContext()
  const boms = await prisma.bOM.findMany({
    where: { tenantId },
    include: {
      item: { include: { category: true } },
      bomItems: {
        include: { componentItem: true },
        orderBy: { seq: "asc" },
      },
    },
    orderBy: [{ item: { name: "asc" } }, { version: "asc" }],
  })
  return boms.map(serializeBom)
}

export async function getBomById(id: string): Promise<BOMWithDetails | null> {
  const { tenantId } = await requireTenantContext()
  const bom = await prisma.bOM.findFirst({
    where: { id, tenantId },
    include: {
      item: { include: { category: true } },
      bomItems: {
        include: { componentItem: true },
        orderBy: { seq: "asc" },
      },
    },
  })
  return bom ? serializeBom(bom) : null
}

export async function getItemsForBom() {
  const { tenantId } = await requireTenantContext()
  return prisma.item.findMany({
    where: { tenantId, itemType: { in: ["FINISHED", "SEMI_FINISHED"] } },
    select: { id: true, code: true, name: true, itemType: true },
    orderBy: { code: "asc" },
  })
}

export async function getComponentItems() {
  const { tenantId } = await requireTenantContext()
  return prisma.item.findMany({
    where: { tenantId },
    select: { id: true, code: true, name: true, itemType: true, uom: true },
    orderBy: { code: "asc" },
  })
}

export type BOMItemInput = {
  componentItemId: string
  seq: number
  qtyPer: number
  scrapRate: number
}

export type CreateBomInput = {
  itemId: string
  version: string
  isDefault: boolean
  status: BOMStatus
  bomItems: BOMItemInput[]
}

export async function createBom(data: CreateBomInput, _tenantId?: string) {
  const { tenantId } = await requireTenantContext()
  const { bomItems, ...bomFields } = data
  await prisma.bOM.create({
    data: {
      ...bomFields,
      tenantId,
      bomItems: {
        create: bomItems.map((item) => ({
          componentItemId: item.componentItemId,
          seq: item.seq,
          qtyPer: item.qtyPer,
          scrapRate: item.scrapRate,
        })),
      },
    },
  })
  revalidatePath("/app/mes/bom")
}

export async function updateBom(id: string, data: CreateBomInput) {
  const { tenantId } = await requireTenantContext()
  const { bomItems, ...bomFields } = data
  const { itemId, version, isDefault, status } = bomFields
  const existing = await prisma.bOM.findFirst({ where: { id, tenantId }, select: { id: true } })
  if (!existing) throw new Error("BOM not found in tenant scope")

  await prisma.$transaction([
    prisma.bOMItem.deleteMany({ where: { bomId: id, bom: { tenantId } } }),
    prisma.bOM.update({
      where: { id: existing.id },
      data: {
        itemId,
        version,
        isDefault,
        status,
        bomItems: {
          create: bomItems.map((item) => ({
            componentItemId: item.componentItemId,
            seq: item.seq,
            qtyPer: item.qtyPer,
            scrapRate: item.scrapRate,
          })),
        },
      },
    }),
  ])
  revalidatePath("/app/mes/bom")
}

export async function deleteBom(id: string) {
  const { tenantId } = await requireTenantContext()
  const existing = await prisma.bOM.findFirst({ where: { id, tenantId }, select: { id: true } })
  if (!existing) throw new Error("BOM not found in tenant scope")
  await prisma.$transaction([
    prisma.bOMItem.deleteMany({ where: { bomId: id, bom: { tenantId } } }),
    prisma.bOM.delete({ where: { id: existing.id } }),
  ])
  revalidatePath("/app/mes/bom")
}
