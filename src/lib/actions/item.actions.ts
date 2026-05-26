"use server"

import { getTenantId, requireRole } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { Prisma, ItemStatus, UOM } from "@prisma/client"
import { ItemFormValues } from "@/app/app/mes/items/item-form-schema"

export type ItemWithDetails = Prisma.ItemGetPayload<{
  include: { category: true; itemGroup: true }
}>

// backward-compat alias
export type ItemWithCategory = ItemWithDetails

export async function getItems(): Promise<ItemWithDetails[]> {
  const tenantId = await getTenantId()
  return prisma.item.findMany({
    where: { tenantId },
    include: { category: true, itemGroup: true },
    orderBy: { code: "asc" },
  })
}

export async function getItemCategories() {
  const tenantId = await getTenantId()
  return prisma.itemCategory.findMany({
    where: { tenantId, itemType: { not: null } },
    orderBy: [{ displayOrder: "asc" }, { code: "asc" }],
  })
}

export async function getItemGroupsForForm() {
  const tenantId = await getTenantId()
  return prisma.itemGroup.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, code: true, name: true, categoryId: true },
    orderBy: [{ displayOrder: "asc" }, { code: "asc" }],
  })
}

async function resolveCategoryAndValidateGroup(
  tenantId: string,
  categoryId: string,
  itemGroupId: string | null | undefined,
) {
  const category = await prisma.itemCategory.findFirst({
    where: { id: categoryId, tenantId },
  })
  if (!category) throw new Error("INVALID_CATEGORY")
  if (!category.itemType) throw new Error("CATEGORY_NO_TYPE")

  if (itemGroupId) {
    const group = await prisma.itemGroup.findFirst({
      where: { id: itemGroupId, tenantId },
    })
    if (!group) throw new Error("INVALID_GROUP")
    if (group.categoryId !== categoryId) throw new Error("GROUP_CATEGORY_MISMATCH")
  }

  return category.itemType
}

export async function createItem(data: ItemFormValues) {
  await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  const existing = await prisma.item.findFirst({ where: { tenantId, code: data.code } })
  if (existing) throw new Error("DUPLICATE_CODE")

  const resolvedItemType = await resolveCategoryAndValidateGroup(
    tenantId,
    data.categoryId,
    data.itemGroupId,
  )

  return prisma.item.create({
    data: {
      tenantId,
      code:            data.code,
      name:            data.name,
      itemType:        resolvedItemType,
      categoryId:      data.categoryId,
      itemGroupId:     data.itemGroupId ?? null,
      uom:             data.uom as UOM,
      spec:            data.spec ?? null,
      isLotTracked:    data.isLotTracked,
      isSerialTracked: data.isSerialTracked,
      status:          data.status as ItemStatus,
    },
  })
}

export async function updateItem(id: string, data: ItemFormValues) {
  await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  const owned = await prisma.item.findFirst({ where: { id, tenantId } })
  if (!owned) throw new Error("NOT_FOUND")

  const duplicate = await prisma.item.findFirst({
    where: { tenantId, code: data.code, NOT: { id } },
  })
  if (duplicate) throw new Error("DUPLICATE_CODE")

  const resolvedItemType = await resolveCategoryAndValidateGroup(
    tenantId,
    data.categoryId,
    data.itemGroupId,
  )

  return prisma.item.update({
    where: { id },
    data: {
      code:            data.code,
      name:            data.name,
      itemType:        resolvedItemType,
      categoryId:      data.categoryId,
      itemGroupId:     data.itemGroupId ?? null,
      uom:             data.uom as UOM,
      spec:            data.spec ?? null,
      isLotTracked:    data.isLotTracked,
      isSerialTracked: data.isSerialTracked,
      status:          data.status as ItemStatus,
    },
  })
}

export async function deleteItem(id: string) {
  await requireRole("OPERATOR")
  const tenantId = await getTenantId()
  return prisma.item.deleteMany({ where: { id, tenantId } })
}
