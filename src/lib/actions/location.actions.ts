"use server"

import { getTenantId, requireRole } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"

export type LocationWithSite = {
  id: string
  tenantId: string
  siteId: string
  code: string
  name: string
  zone: string | null
  site: { id: string; code: string; name: string }
}

export async function getLocations(): Promise<LocationWithSite[]> {
  const tenantId = await getTenantId()
  return prisma.warehouse.findMany({
    where: { tenantId },
    include: { site: { select: { id: true, code: true, name: true } } },
    orderBy: [{ siteId: "asc" }, { code: "asc" }],
  }) as any
}

export async function getSitesForLocation() {
  const tenantId = await getTenantId()
  return prisma.site.findMany({
    where: { tenantId },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  })
}

export type CreateLocationInput = {
  siteId: string
  code: string
  name: string
  zone?: string
}

export async function createLocation(data: CreateLocationInput) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()
  const { zone, ...rest } = data
  const created = await prisma.warehouse.create({
    data: { ...rest, zone: zone || null, tenantId },
  })
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: actor.id,
      actorLabel: actor.name,
      entityType: "Warehouse",
      entityId: created.id,
      action: "CREATE",
      afterData: { code: created.code, name: created.name, zone: created.zone, siteId: created.siteId },
      menuName: "창고/로케이션 관리",
    },
  }).catch(() => {})
  revalidatePath("/app/mes/locations")
}

export async function updateLocation(id: string, data: Omit<CreateLocationInput, "siteId">) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()
  const owned = await prisma.warehouse.findFirst({ where: { id, tenantId } })
  if (!owned) throw new Error("NOT_FOUND")

  const { zone, ...rest } = data
  await prisma.warehouse.update({
    where: { id },
    data: { ...rest, zone: zone || null },
  })
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: actor.id,
      actorLabel: actor.name,
      entityType: "Warehouse",
      entityId: id,
      action: "UPDATE",
      beforeData: { code: owned.code, name: owned.name, zone: owned.zone },
      afterData: { code: data.code, name: data.name, zone: zone || null },
      menuName: "창고/로케이션 관리",
    },
  }).catch(() => {})
  revalidatePath("/app/mes/locations")
}

export async function deleteLocation(id: string) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()
  const owned = await prisma.warehouse.findFirst({ where: { id, tenantId } })
  if (!owned) throw new Error("NOT_FOUND")

  const locationCount = await prisma.location.count({ where: { warehouseId: id } })
  if (locationCount > 0) {
    throw new Error(`이 로케이션에 세부 구역이 ${locationCount}건 있습니다. 재고 데이터를 먼저 처리해주세요.`)
  }
  await prisma.warehouse.delete({ where: { id } })
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: actor.id,
      actorLabel: actor.name,
      entityType: "Warehouse",
      entityId: id,
      action: "DELETE",
      beforeData: { code: owned.code, name: owned.name, zone: owned.zone, siteId: owned.siteId },
      menuName: "창고/로케이션 관리",
    },
  }).catch(() => {})
  revalidatePath("/app/mes/locations")
}
