"use server"

import { requireTenantContext } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { WorkCenterKind } from "@prisma/client"
import { revalidatePath } from "next/cache"

export type WorkCenterWithDetails = {
  id: string
  siteId: string
  code: string
  name: string
  kind: WorkCenterKind
  createdAt: Date
  updatedAt: Date
  site: { id: string; code: string; name: string }
  _count: { routingOperations: number }
}

export async function getWorkCentersWithDetails(): Promise<WorkCenterWithDetails[]> {
  const { tenantId } = await requireTenantContext()

  return prisma.workCenter.findMany({
    where: { site: { tenantId } },
    include: {
      site: true,
      _count: { select: { routingOperations: true } },
    },
    orderBy: { code: "asc" },
  }) as any
}

export async function getSitesForWorkCenter() {
  const { tenantId } = await requireTenantContext()

  return prisma.site.findMany({
    where: { tenantId },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  })
}

export type CreateWorkCenterInput = {
  siteId: string
  code: string
  name: string
  kind: WorkCenterKind
}

export async function createWorkCenter(data: CreateWorkCenterInput) {
  const { tenantId } = await requireTenantContext()
  const site = await prisma.site.findFirst({
    where: { id: data.siteId, tenantId },
    select: { id: true },
  })

  if (!site) {
    throw new Error("Site not found in tenant scope")
  }

  await prisma.workCenter.create({ data })
  revalidatePath("/app/mes/work-centers")
}

export async function updateWorkCenter(id: string, data: Omit<CreateWorkCenterInput, "siteId">) {
  const { tenantId } = await requireTenantContext()
  const result = await prisma.workCenter.updateMany({
    where: { id, site: { tenantId } },
    data,
  })

  if (result.count === 0) {
    throw new Error("Work center not found in tenant scope")
  }

  revalidatePath("/app/mes/work-centers")
}

export async function deleteWorkCenter(id: string) {
  const { tenantId } = await requireTenantContext()
  const count = await prisma.routingOperation.count({
    where: { workCenterId: id, workCenter: { site: { tenantId } } },
  })

  if (count > 0) {
    throw new Error("Cannot delete work center referenced by routing operations")
  }

  const result = await prisma.workCenter.deleteMany({
    where: { id, site: { tenantId } },
  })

  if (result.count === 0) {
    throw new Error("Work center not found in tenant scope")
  }

  revalidatePath("/app/mes/work-centers")
}
