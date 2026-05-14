"use server"

import { getTenantId } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { Prisma, ItemType, ItemStatus, UOM } from "@prisma/client"
import { ItemFormValues } from "@/app/app/mes/items/item-form-schema"

export type ItemWithCategory = Prisma.ItemGetPayload<{
  include: { category: true }
}>

export async function getItems(): Promise<ItemWithCategory[]> {
  const tenantId = await getTenantId()
  return prisma.item.findMany({
    where: { tenantId },
    include: { category: true },
    orderBy: { code: "asc" },
  })
}

export async function getItemCategories() {
  const tenantId = await getTenantId()
  return prisma.itemCategory.findMany({
    where: { tenantId },
    orderBy: { code: "asc" },
  })
}

export async function createItem(data: ItemFormValues, _tenantId?: string) {
  const tenantId = await getTenantId()
  const existing = await prisma.item.findFirst({
    where: { tenantId, code: data.code },
  })
  if (existing) {
    throw new Error("DUPLICATE_CODE")
  }

  return prisma.item.create({
    data: {
      tenantId,
      code: data.code,
      name: data.name,
      itemType: data.itemType as ItemType,
      categoryId: data.categoryId ?? null,
      uom: data.uom as UOM,
      spec: data.spec ?? null,
      isLotTracked: data.isLotTracked,
      isSerialTracked: data.isSerialTracked,
      status: data.status as ItemStatus,
    },
  })
}

export async function updateItem(id: string, data: ItemFormValues) {
  const tenantId = await getTenantId()
  const owned = await prisma.item.findFirst({ where: { id, tenantId } })
  if (!owned) throw new Error("NOT_FOUND")

  const duplicate = await prisma.item.findFirst({
    where: { tenantId, code: data.code, NOT: { id } },
  })
  if (duplicate) throw new Error("DUPLICATE_CODE")

  return prisma.item.update({
    where: { id },
    data: {
      code: data.code,
      name: data.name,
      itemType: data.itemType as ItemType,
      categoryId: data.categoryId ?? null,
      uom: data.uom as UOM,
      spec: data.spec ?? null,
      isLotTracked: data.isLotTracked,
      isSerialTracked: data.isSerialTracked,
      status: data.status as ItemStatus,
    },
  })
}

export async function deleteItem(id: string) {
  const tenantId = await getTenantId()
  return prisma.item.deleteMany({ where: { id, tenantId } })
}
