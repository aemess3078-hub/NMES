"use server"

import { getTenantId, requireRole } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { Prisma, ItemType } from "@prisma/client"

export type ItemCategoryWithCounts = Prisma.ItemCategoryGetPayload<{
  include: { _count: { select: { items: true; itemGroups: true } } }
}>

export async function getItemCategoriesForManagement(): Promise<ItemCategoryWithCounts[]> {
  const tenantId = await getTenantId()
  return prisma.itemCategory.findMany({
    where: { tenantId },
    include: {
      _count: { select: { items: true, itemGroups: true } },
    },
    orderBy: [{ displayOrder: "asc" }, { code: "asc" }],
  })
}

export type ItemCategoryFormData = {
  code:         string
  name:         string
  itemType?:    string | null
  displayOrder?: number
}

export async function createItemCategory(data: ItemCategoryFormData) {
  await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  const existing = await prisma.itemCategory.findFirst({
    where: { tenantId, code: data.code },
  })
  if (existing) throw new Error("DUPLICATE_CODE")

  return prisma.itemCategory.create({
    data: {
      tenantId,
      code:         data.code,
      name:         data.name,
      itemType:     (data.itemType as ItemType) ?? null,
      displayOrder: data.displayOrder ?? 0,
    },
  })
}

export async function updateItemCategory(id: string, data: ItemCategoryFormData) {
  await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  const owned = await prisma.itemCategory.findFirst({ where: { id, tenantId } })
  if (!owned) throw new Error("NOT_FOUND")

  const duplicate = await prisma.itemCategory.findFirst({
    where: { tenantId, code: data.code, NOT: { id } },
  })
  if (duplicate) throw new Error("DUPLICATE_CODE")

  return prisma.itemCategory.update({
    where: { id },
    data: {
      code:         data.code,
      name:         data.name,
      itemType:     (data.itemType as ItemType) ?? null,
      displayOrder: data.displayOrder ?? 0,
    },
  })
}

export async function deleteItemCategory(id: string) {
  await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  const owned = await prisma.itemCategory.findFirst({ where: { id, tenantId } })
  if (!owned) throw new Error("NOT_FOUND")

  const [itemCount, groupCount] = await Promise.all([
    prisma.item.count({ where: { categoryId: id } }),
    prisma.itemGroup.count({ where: { categoryId: id } }),
  ])
  if (itemCount > 0) throw new Error("HAS_ITEMS")
  if (groupCount > 0) throw new Error("HAS_GROUPS")

  return prisma.itemCategory.delete({ where: { id } })
}
