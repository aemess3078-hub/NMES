"use server"

import { getTenantId, requireRole } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { Prisma, ItemStatus, UOM, LotNumberingType, ManualLotPolicy } from "@prisma/client"
import { ItemFormValues } from "@/app/app/mes/items/item-form-schema"

export type ItemWithDetails = Prisma.ItemGetPayload<{
  include: {
    category: true
    itemGroup: true
    defaultWarehouse: { select: { id: true; code: true; name: true; siteId: true } }
  }
}>

// backward-compat alias
export type ItemWithCategory = ItemWithDetails

export type WarehouseForItemForm = {
  id: string
  code: string
  name: string
  siteId: string
  siteName: string
}

export async function getItems(): Promise<ItemWithDetails[]> {
  const tenantId = await getTenantId()
  return prisma.item.findMany({
    where: { tenantId },
    include: {
      category: true,
      itemGroup: true,
      defaultWarehouse: { select: { id: true, code: true, name: true, siteId: true } },
    },
    orderBy: { code: "asc" },
  })
}

export async function getWarehousesForItemForm(): Promise<WarehouseForItemForm[]> {
  const tenantId = await getTenantId()
  const warehouses = await prisma.warehouse.findMany({
    where: { tenantId },
    select: {
      id: true,
      code: true,
      name: true,
      siteId: true,
      site: { select: { name: true } },
    },
    orderBy: [{ site: { name: "asc" } }, { name: "asc" }],
  })
  return warehouses.map((w) => ({
    id: w.id,
    code: w.code,
    name: w.name,
    siteId: w.siteId,
    siteName: w.site.name,
  }))
}

async function resolveDefaultWarehouseId(
  tenantId: string,
  defaultWarehouseId: string | null | undefined,
): Promise<string | null> {
  if (!defaultWarehouseId) return null
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: defaultWarehouseId, tenantId },
    select: { id: true },
  })
  if (!warehouse) throw new Error("INVALID_WAREHOUSE")
  return warehouse.id
}

function resolveLotNumberingSettings(data: ItemFormValues): {
  lotNumberingType: LotNumberingType
  lotPrefix: string | null
  manualLotPolicy: ManualLotPolicy
} {
  if (!data.isLotTracked) {
    return {
      lotNumberingType: "DEFAULT",
      lotPrefix: null,
      manualLotPolicy: "ALLOWED",
    }
  }

  const lotNumberingType = (data.lotNumberingType ?? "DEFAULT") as LotNumberingType
  const requestedManualLotPolicy = (data.manualLotPolicy ?? "ALLOWED") as ManualLotPolicy
  const manualLotPolicy = lotNumberingType === "MANUAL" ? "REQUIRED" : requestedManualLotPolicy
  const lotPrefix = data.lotPrefix?.trim().toUpperCase() || null

  if (lotNumberingType === "PREFIX_MONTH_SEQ") {
    if (!lotPrefix) throw new Error("LOT_PREFIX_REQUIRED")
    if (!/^[A-Z0-9]+$/.test(lotPrefix)) throw new Error("INVALID_LOT_PREFIX")
  }

  return {
    lotNumberingType,
    lotPrefix: lotNumberingType === "PREFIX_MONTH_SEQ" ? lotPrefix : null,
    manualLotPolicy,
  }
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
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  const existing = await prisma.item.findFirst({ where: { tenantId, code: data.code } })
  if (existing) throw new Error("DUPLICATE_CODE")

  const resolvedItemType = await resolveCategoryAndValidateGroup(
    tenantId,
    data.categoryId,
    data.itemGroupId,
  )
  const resolvedDefaultWarehouseId = await resolveDefaultWarehouseId(
    tenantId,
    data.defaultWarehouseId,
  )
  const lotNumberingSettings = resolveLotNumberingSettings(data)

  const item = await prisma.item.create({
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
      ...lotNumberingSettings,
      status:          data.status as ItemStatus,
      defaultWarehouseId: resolvedDefaultWarehouseId,
    },
  })
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: actor.id,
      actorLabel: actor.name,
      entityType: "Item",
      entityId: item.id,
      action: "CREATE",
      afterData: { code: item.code, name: item.name, itemType: item.itemType, status: item.status },
      menuName: "품목 관리",
    },
  }).catch(() => {})
  return item
}

export async function updateItem(id: string, data: ItemFormValues) {
  const actor = await requireRole("OPERATOR")
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
  const resolvedDefaultWarehouseId = await resolveDefaultWarehouseId(
    tenantId,
    data.defaultWarehouseId,
  )
  const lotNumberingSettings = resolveLotNumberingSettings(data)

  const updated = await prisma.item.update({
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
      ...lotNumberingSettings,
      status:          data.status as ItemStatus,
      defaultWarehouseId: resolvedDefaultWarehouseId,
    },
  })
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: actor.id,
      actorLabel: actor.name,
      entityType: "Item",
      entityId: id,
      action: "UPDATE",
      beforeData: { code: owned.code, name: owned.name, status: owned.status },
      afterData: { code: data.code, name: data.name, status: data.status },
      menuName: "품목 관리",
    },
  }).catch(() => {})
  return updated
}

export async function deleteItem(id: string) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()
  const owned = await prisma.item.findFirst({ where: { id, tenantId } })
  const result = await prisma.item.deleteMany({ where: { id, tenantId } })
  if (owned) {
    await prisma.auditLog.create({
      data: {
        tenantId,
        actorId: actor.id,
        actorLabel: actor.name,
        entityType: "Item",
        entityId: id,
        action: "DELETE",
        beforeData: { code: owned.code, name: owned.name, status: owned.status },
        menuName: "품목 관리",
      },
    }).catch(() => {})
  }
  return result
}
