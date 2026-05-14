"use server"

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
  return prisma.warehouse.findMany({
    include: {
      site: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ siteId: "asc" }, { code: "asc" }],
  }) as any
}

export async function getSitesForLocation() {
  return prisma.site.findMany({
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
  const { zone, ...rest } = data
  await prisma.warehouse.create({
    data: {
      ...rest,
      zone: zone || null,
      tenantId: "tenant-demo-001",
    },
  })
  revalidatePath("/app/mes/locations")
}

export async function updateLocation(id: string, data: Omit<CreateLocationInput, "siteId">) {
  const { zone, ...rest } = data
  await prisma.warehouse.update({
    where: { id },
    data: {
      ...rest,
      zone: zone || null,
    },
  })
  revalidatePath("/app/mes/locations")
}

export async function deleteLocation(id: string) {
  // Warehouse 하위의 Location(세부 로케이션) 수 확인
  const locationCount = await prisma.location.count({ where: { warehouseId: id } })
  if (locationCount > 0) {
    throw new Error(`이 로케이션에 세부 구역이 ${locationCount}건 있습니다. 재고 데이터를 먼저 처리해주세요.`)
  }
  await prisma.warehouse.delete({ where: { id } })
  revalidatePath("/app/mes/locations")
}
