"use server"

import { requireTenantContext } from "@/lib/auth"
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
  const { tenantId } = await requireTenantContext()
  return prisma.routing.findMany({
    where: { tenantId },
    include: {
      items: {
        include: {
          item: { include: { category: true } },
        },
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
  const { tenantId } = await requireTenantContext()
  return prisma.routing.findFirst({
    where: { id, tenantId },
    include: {
      items: {
        include: {
          item: { include: { category: true } },
        },
      },
      operations: {
        include: { workCenter: true },
        orderBy: { seq: "asc" },
      },
    },
  }) as any
}

export async function getItemsForRouting() {
  const { tenantId } = await requireTenantContext()
  return prisma.item.findMany({
    where: { tenantId, itemType: { in: ["FINISHED", "SEMI_FINISHED"] } },
    select: { id: true, code: true, name: true, itemType: true },
    orderBy: { code: "asc" },
  })
}

export async function getWorkCenters() {
  const { tenantId } = await requireTenantContext()
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
  const { tenantId } = await requireTenantContext()
  const [item, workCenters] = await Promise.all([
    prisma.item.findFirst({
      where: { id: data.itemId, tenantId },
      select: { id: true },
    }),
    prisma.workCenter.findMany({
      where: {
        id: { in: data.operations.map((op) => op.workCenterId) },
        site: { tenantId },
      },
      select: { id: true },
    }),
  ])

  if (!item) {
    throw new Error("Item not found in tenant scope")
  }
  if (workCenters.length !== data.operations.length) {
    throw new Error("One or more work centers are outside tenant scope")
  }

  const { operations, itemId, isDefault, ...routingFields } = data

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

    await tx.itemRouting.create({
      data: {
        tenantId,
        itemId,
        routingId: routing.id,
        isDefault,
      },
    })
  })

  revalidatePath("/app/mes/routing")
}

export async function updateRouting(id: string, data: CreateRoutingInput) {
  const { tenantId } = await requireTenantContext()
  const existing = await prisma.routing.findFirst({
    where: { id, tenantId },
    select: { id: true, tenantId: true },
  })

  if (!existing) {
    throw new Error("Routing not found in tenant scope")
  }

  const [item, workCenters] = await Promise.all([
    prisma.item.findFirst({
      where: { id: data.itemId, tenantId },
      select: { id: true },
    }),
    prisma.workCenter.findMany({
      where: {
        id: { in: data.operations.map((op) => op.workCenterId) },
        site: { tenantId },
      },
      select: { id: true },
    }),
  ])

  if (!item) {
    throw new Error("Item not found in tenant scope")
  }
  if (workCenters.length !== data.operations.length) {
    throw new Error("One or more work centers are outside tenant scope")
  }

  const { operations, itemId, isDefault, ...routingFields } = data
  const { code, name, version, status } = routingFields

  await prisma.$transaction(async (tx) => {
    await tx.routingOperation.deleteMany({
      where: { routingId: id, routing: { tenantId } },
    })

    await tx.routing.update({
      where: { id: existing.id },
      data: {
        code,
        name,
        version,
        status,
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
      create: {
        tenantId: existing.tenantId,
        itemId,
        routingId: id,
        isDefault,
      },
      update: { isDefault },
    })
  })

  revalidatePath("/app/mes/routing")
}

export async function deleteRouting(id: string) {
  const { tenantId } = await requireTenantContext()
  const existing = await prisma.routing.findFirst({
    where: { id, tenantId },
    select: { id: true },
  })

  if (!existing) {
    throw new Error("Routing not found in tenant scope")
  }

  await prisma.$transaction([
    prisma.itemRouting.deleteMany({ where: { routingId: id, tenantId } }),
    prisma.routingOperation.deleteMany({ where: { routingId: id, routing: { tenantId } } }),
    prisma.routing.delete({ where: { id: existing.id } }),
  ])
  revalidatePath("/app/mes/routing")
}
