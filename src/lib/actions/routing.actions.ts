"use server"

import { getTenantId, requireRole } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { RoutingStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"

export type RoutingWithDetails = {
  id: string
  tenantId: string
  code: string
  name: string
  version: string
  status: RoutingStatus
  createdAt: Date
  updatedAt: Date
  items: {
    id: string
    itemId: string
    isDefault: boolean
    item: {
      id: string
      code: string
      name: string
      itemType: string
      category: { id: string; name: string } | null
    }
  }[]
  operations: {
    id: string
    routingId: string
    seq: number
    operationCode: string
    name: string
    workCenterId: string
    standardTime: any
    workCenter: { id: string; code: string; name: string }
  }[]
}

export async function getRoutings(): Promise<RoutingWithDetails[]> {
  const tenantId = await getTenantId()
  return prisma.routing.findMany({
    where: { tenantId },
    include: {
      items: {
        include: { item: { include: { category: true } } },
      },
      operations: {
        include: { workCenter: true },
        orderBy: { seq: "asc" },
      },
    },
    orderBy: [{ code: "asc" }, { version: "asc" }],
  }) as any
}

export async function getRoutingById(id: string): Promise<RoutingWithDetails | null> {
  const tenantId = await getTenantId()
  return prisma.routing.findFirst({
    where: { id, tenantId },
    include: {
      items: {
        include: { item: { include: { category: true } } },
      },
      operations: {
        include: { workCenter: true },
        orderBy: { seq: "asc" },
      },
    },
  }) as any
}

export async function getItemsForRouting() {
  const tenantId = await getTenantId()
  return prisma.item.findMany({
    where: { tenantId, itemType: { in: ["FINISHED", "SEMI_FINISHED"] } },
    select: { id: true, code: true, name: true, itemType: true },
    orderBy: { code: "asc" },
  })
}

export async function getWorkCenters() {
  const tenantId = await getTenantId()
  return prisma.workCenter.findMany({
    where: { site: { tenantId } },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  })
}

export type RoutingOperationInput = {
  seq: number
  operationCode: string
  name: string
  workCenterId: string
  standardTime: number
}

export type CreateRoutingInput = {
  code: string
  name: string
  version: string
  status: RoutingStatus
  itemId: string
  isDefault: boolean
  operations: RoutingOperationInput[]
}

export async function createRouting(data: CreateRoutingInput, _tenantId?: string) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()
  const { operations, itemId, isDefault, ...routingFields } = data

  let createdId = ""
  await prisma.$transaction(async (tx) => {
    const routing = await tx.routing.create({
      data: {
        ...routingFields,
        tenantId,
        operations: {
          create: operations.map((op) => ({
            seq: op.seq,
            operationCode: op.operationCode,
            name: op.name,
            workCenterId: op.workCenterId,
            standardTime: op.standardTime,
          })),
        },
      },
    })
    createdId = routing.id
    await tx.itemRouting.create({
      data: { tenantId, itemId, routingId: routing.id, isDefault },
    })
  })

  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: actor.id,
      actorLabel: actor.name,
      entityType: "Routing",
      entityId: createdId,
      action: "CREATE",
      afterData: { code: data.code, name: data.name, version: data.version, status: data.status, operationCount: operations.length },
      menuName: "라우팅 관리",
    },
  }).catch(() => {})
  revalidatePath("/app/mes/routing")
}

export async function updateRouting(id: string, data: CreateRoutingInput) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()
  const owned = await prisma.routing.findFirst({ where: { id, tenantId } })
  if (!owned) throw new Error("NOT_FOUND")

  const { operations, itemId, isDefault, ...routingFields } = data
  const { code, name, version, status } = routingFields

  await prisma.$transaction(async (tx) => {
    await tx.routingOperation.deleteMany({ where: { routingId: id } })
    await tx.routing.update({
      where: { id },
      data: {
        code, name, version, status,
        operations: {
          create: operations.map((op) => ({
            seq: op.seq,
            operationCode: op.operationCode,
            name: op.name,
            workCenterId: op.workCenterId,
            standardTime: op.standardTime,
          })),
        },
      },
    })
    await tx.itemRouting.upsert({
      where: { itemId_routingId: { itemId, routingId: id } },
      create: { tenantId, itemId, routingId: id, isDefault },
      update: { isDefault },
    })
  })

  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: actor.id,
      actorLabel: actor.name,
      entityType: "Routing",
      entityId: id,
      action: "UPDATE",
      beforeData: { code: owned.code, name: owned.name, version: owned.version, status: owned.status },
      afterData: { code, name, version, status, operationCount: operations.length },
      menuName: "라우팅 관리",
    },
  }).catch(() => {})
  revalidatePath("/app/mes/routing")
}

export async function deleteRouting(id: string) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()
  const owned = await prisma.routing.findFirst({ where: { id, tenantId } })
  if (!owned) throw new Error("NOT_FOUND")

  await prisma.$transaction([
    prisma.itemRouting.deleteMany({ where: { routingId: id } }),
    prisma.routingOperation.deleteMany({ where: { routingId: id } }),
    prisma.routing.delete({ where: { id } }),
  ])
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorId: actor.id,
      actorLabel: actor.name,
      entityType: "Routing",
      entityId: id,
      action: "DELETE",
      beforeData: { code: owned.code, name: owned.name, version: owned.version, status: owned.status },
      menuName: "라우팅 관리",
    },
  }).catch(() => {})
  revalidatePath("/app/mes/routing")
}
