"use server"

import { requireTenantContext } from "@/lib/auth"
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
  const { tenantId } = await requireTenantContext()

  return prisma.warehouse.findMany({
    where: { tenantId },
    include: {
      site: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ siteId: "asc" }, { code: "asc" }],
  }) as any
}

export async function getSitesForLocation() {
  const { tenantId } = await requireTenantContext()

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
  const { tenantId } = await requireTenantContext()
  const site = await prisma.site.findFirst({
    where: { id: data.siteId, tenantId },
    select: { id: true },
  })

  if (!site) {
    throw new Error("Site not found in tenant scope")
  }

  const { zone, ...rest } = data
  await prisma.warehouse.create({
    data: {
      ...rest,
      zone: zone || null,
      tenantId,
    },
  })
  revalidatePath("/app/mes/locations")
}

export async function updateLocation(id: string, data: Omit<CreateLocationInput, "siteId">) {
  const { tenantId } = await requireTenantContext()
  const { zone, ...rest } = data

  const result = await prisma.warehouse.updateMany({
    where: { id, tenantId },
    data: {
      ...rest,
      zone: zone || null,
    },
  })

  if (result.count === 0) {
    throw new Error("Location not found in tenant scope")
  }

  revalidatePath("/app/mes/locations")
}

export async function deleteLocation(id: string) {
  const { tenantId } = await requireTenantContext()
  const locationCount = await prisma.location.count({
    where: { warehouseId: id, warehouse: { tenantId } },
  })

  if (locationCount > 0) {
    throw new Error("Cannot delete warehouse with child locations")
  }

  const result = await prisma.warehouse.deleteMany({
    where: { id, tenantId },
  })

  if (result.count === 0) {
    throw new Error("Location not found in tenant scope")
  }

  revalidatePath("/app/mes/locations")
}
