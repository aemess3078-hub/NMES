"use server"

import { prisma } from "@/lib/db/prisma"
import { Prisma, ItemType, ItemStatus, UOM } from "@prisma/client"
import { ItemFormValues } from "@/app/app/mes/items/item-form-schema"

export type ItemWithCategory = Prisma.ItemGetPayload<{
  include: { category: true }
}>

export async function getItems(): Promise<ItemWithCategory[]> {
  return prisma.item.findMany({
    include: { category: true },
    orderBy: { code: "asc" },
  })
}

export async function getItemCategories() {
  return prisma.itemCategory.findMany({
    orderBy: { code: "asc" },
  })
}

export async function createItem(data: ItemFormValues, tenantId: string) {
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
  const existing = await prisma.item.findFirst({
    where: { code: data.code, NOT: { id } },
  })
  if (existing) {
    throw new Error("DUPLICATE_CODE")
  }

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
  return prisma.item.delete({ where: { id } })
}
