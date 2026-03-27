"use server"

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
  return prisma.workCenter.findMany({
    include: {
      site: true,
      _count: { select: { routingOperations: true } },
    },
    orderBy: { code: "asc" },
  }) as any
}

export async function getSitesForWorkCenter() {
  return prisma.site.findMany({
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
  await prisma.workCenter.create({ data })
  revalidatePath("/app/mes/work-centers")
}

export async function updateWorkCenter(id: string, data: Omit<CreateWorkCenterInput, "siteId">) {
  await prisma.workCenter.update({ where: { id }, data })
  revalidatePath("/app/mes/work-centers")
}

export async function deleteWorkCenter(id: string) {
  const count = await prisma.routingOperation.count({ where: { workCenterId: id } })
  if (count > 0) throw new Error(`이 공정을 사용하는 라우팅 공정이 ${count}건 있습니다. 먼저 라우팅에서 제거해주세요.`)
  await prisma.workCenter.delete({ where: { id } })
  revalidatePath("/app/mes/work-centers")
}
