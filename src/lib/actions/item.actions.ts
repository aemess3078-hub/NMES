"use server"

import { requireTenantContext } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { Prisma, ItemType, ItemStatus, UOM } from "@prisma/client"
import { ItemFormValues } from "@/app/app/mes/items/item-form-schema"

export type ItemWithCategory = Prisma.ItemGetPayload<{
  include: { category: true }
}>

export async function getItems(): Promise<ItemWithCategory[]> {
  const { tenantId } = await requireTenantContext()
  return prisma.item.findMany({
    where: { tenantId },
    include: { category: true },
    orderBy: { code: "asc" },
  })
}

export async function getItemCategories() {
  const { tenantId } = await requireTenantContext()
  return prisma.itemCategory.findMany({
    where: { tenantId },
    orderBy: { code: "asc" },
  })
}

export async function createItem(data: ItemFormValues, _tenantId?: string) {
  const { tenantId } = await requireTenantContext()
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
  const { tenantId } = await requireTenantContext()
  const existing = await prisma.item.findFirst({
    where: { tenantId, code: data.code, NOT: { id } },
  })
  if (existing) {
    throw new Error("DUPLICATE_CODE")
  }

  const result = await prisma.item.updateMany({
    where: { id, tenantId },
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

  if (result.count === 0) {
    throw new Error("Item not found in tenant scope")
  }
}

export async function deleteItem(id: string) {
  const { tenantId } = await requireTenantContext()
  const result = await prisma.item.deleteMany({ where: { id, tenantId } })

  if (result.count === 0) {
    throw new Error("Item not found in tenant scope")
  }
}
