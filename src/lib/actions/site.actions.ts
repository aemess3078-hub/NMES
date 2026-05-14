"use server"

import { getTenantId } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { SiteType } from "@prisma/client"
import { revalidatePath } from "next/cache"

export type SiteWithLocations = {
  id: string
  tenantId: string
  code: string
  name: string
  type: SiteType
  createdAt: Date
  updatedAt: Date
  warehouses: {
    id: string
    code: string
    name: string
    zone: string | null
  }[]
}

export type SiteRow = {
  id: string
  tenantId: string
  code: string
  name: string
  type: SiteType
  createdAt: Date
  updatedAt: Date
  _count: { warehouses: number }
}

export async function getSites(): Promise<SiteRow[]> {
  const tenantId = await getTenantId()
  return prisma.site.findMany({
    where: { tenantId },
    include: { _count: { select: { warehouses: true } } },
    orderBy: { code: "asc" },
  }) as any
}

export async function getSitesSimple() {
  const tenantId = await getTenantId()
  return prisma.site.findMany({
    where: { tenantId },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  })
}

export async function getSiteWithLocations(siteId: string): Promise<SiteWithLocations | null> {
  const tenantId = await getTenantId()
  return prisma.site.findFirst({
    where: { id: siteId, tenantId },
    include: {
      warehouses: {
        select: { id: true, code: true, name: true, zone: true },
        orderBy: { code: "asc" },
      },
    },
  }) as any
}

export type CreateSiteInput = {
  code: string
  name: string
  type?: SiteType
}

export async function createSite(data: CreateSiteInput) {
  const tenantId = await getTenantId()
  await prisma.site.create({
    data: {
      code: data.code,
      name: data.name,
      type: data.type ?? SiteType.FACTORY,
      tenantId,
    },
  })
  revalidatePath("/app/mes/sites")
}

export async function updateSite(id: string, data: CreateSiteInput) {
  const tenantId = await getTenantId()
  const owned = await prisma.site.findFirst({ where: { id, tenantId } })
  if (!owned) throw new Error("NOT_FOUND")

  await prisma.site.update({
    where: { id },
    data: { code: data.code, name: data.name, type: data.type ?? SiteType.FACTORY },
  })
  revalidatePath("/app/mes/sites")
}

export async function deleteSite(id: string) {
  const tenantId = await getTenantId()
  const owned = await prisma.site.findFirst({ where: { id, tenantId } })
  if (!owned) throw new Error("NOT_FOUND")

  const warehouseCount = await prisma.warehouse.count({ where: { siteId: id } })
  if (warehouseCount > 0) {
    throw new Error(`이 사이트에 로케이션이 ${warehouseCount}건 있습니다. 로케이션을 먼저 삭제해주세요.`)
  }
  const userCount = await prisma.tenantUser.count({ where: { siteId: id } })
  if (userCount > 0) {
    throw new Error(`이 사이트에 배정된 사용자가 ${userCount}명 있습니다. 사용자 배정을 먼저 해제해주세요.`)
  }
  await prisma.site.delete({ where: { id } })
  revalidatePath("/app/mes/sites")
}
