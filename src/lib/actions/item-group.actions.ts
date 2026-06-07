"use server"

import { getTenantId, requireRole } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { Prisma } from "@prisma/client"

export type ItemGroupWithDetails = Prisma.ItemGroupGetPayload<{
  include: {
    category: true
    _count: { select: { items: true } }
  }
}>

export async function getItemGroupsForManagement(): Promise<ItemGroupWithDetails[]> {
  const tenantId = await getTenantId()
  return prisma.itemGroup.findMany({
    where: { tenantId },
    include: {
      category: true,
      _count: { select: { items: true } },
    },
    orderBy: [{ displayOrder: "asc" }, { code: "asc" }],
  })
}

export type ItemGroupFormData = {
  categoryId:   string
  code:         string
  name:         string
  description?: string | null
  displayOrder?: number
  isActive:     boolean
}

export async function createItemGroup(data: ItemGroupFormData) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  const [duplicate, ownedCategory] = await Promise.all([
    prisma.itemGroup.findFirst({ where: { tenantId, code: data.code } }),
    prisma.itemCategory.findFirst({ where: { id: data.categoryId, tenantId } }),
  ])
  if (duplicate) throw new Error("DUPLICATE_CODE")
  if (!ownedCategory) throw new Error("INVALID_CATEGORY")

  const created = await prisma.itemGroup.create({
    data: {
      tenantId,
      categoryId:   data.categoryId,
      code:         data.code,
      name:         data.name,
      description:  data.description ?? null,
      displayOrder: data.displayOrder ?? 0,
      isActive:     data.isActive,
    },
  })
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: actor.id,
      actorLabel: actor.name,
      entityType: "ItemGroup",
      entityId: created.id,
      action: "CREATE",
      afterData: { code: created.code, name: created.name, isActive: created.isActive },
      menuName: "품목 그룹 관리",
    },
  }).catch(() => {})
  return created
}

export async function updateItemGroup(id: string, data: ItemGroupFormData) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  const owned = await prisma.itemGroup.findFirst({ where: { id, tenantId } })
  if (!owned) throw new Error("NOT_FOUND")

  const [duplicate, ownedCategory] = await Promise.all([
    prisma.itemGroup.findFirst({ where: { tenantId, code: data.code, NOT: { id } } }),
    prisma.itemCategory.findFirst({ where: { id: data.categoryId, tenantId } }),
  ])
  if (duplicate) throw new Error("DUPLICATE_CODE")
  if (!ownedCategory) throw new Error("INVALID_CATEGORY")

  const updated = await prisma.itemGroup.update({
    where: { id },
    data: {
      categoryId:   data.categoryId,
      code:         data.code,
      name:         data.name,
      description:  data.description ?? null,
      displayOrder: data.displayOrder ?? 0,
      isActive:     data.isActive,
    },
  })
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: actor.id,
      actorLabel: actor.name,
      entityType: "ItemGroup",
      entityId: id,
      action: "UPDATE",
      beforeData: { code: owned.code, name: owned.name, isActive: owned.isActive },
      afterData: { code: data.code, name: data.name, isActive: data.isActive },
      menuName: "품목 그룹 관리",
    },
  }).catch(() => {})
  return updated
}

export async function deleteItemGroup(id: string) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  const owned = await prisma.itemGroup.findFirst({ where: { id, tenantId } })
  if (!owned) throw new Error("NOT_FOUND")

  const itemCount = await prisma.item.count({ where: { itemGroupId: id } })
  if (itemCount > 0) throw new Error("HAS_ITEMS")

  const result = await prisma.itemGroup.delete({ where: { id } })
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: actor.id,
      actorLabel: actor.name,
      entityType: "ItemGroup",
      entityId: id,
      action: "DELETE",
      beforeData: { code: owned.code, name: owned.name, isActive: owned.isActive },
      menuName: "품목 그룹 관리",
    },
  }).catch(() => {})
  return result
}
