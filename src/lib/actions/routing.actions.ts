"use server"

import { prisma } from "@/lib/db/prisma"
import { RoutingStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"

export type RoutingWithDetails = {
  id: string
  tenantId: string
  itemId: string
  version: string
  isDefault: boolean
  status: RoutingStatus
  createdAt: Date
  updatedAt: Date
  item: {
    id: string
    code: string
    name: string
    itemType: string
    category: { id: string; name: string } | null
  }
  operations: {
    id: string
    routingId: string
    seq: number
    operationCode: string
    name: string
    workCenterId: string
    standardTime: any // Decimal
    workCenter: { id: string; code: string; name: string }
  }[]
}

export async function getRoutings(): Promise<RoutingWithDetails[]> {
  return prisma.routing.findMany({
    include: {
      item: { include: { category: true } },
      operations: {
        include: { workCenter: true },
        orderBy: { seq: "asc" },
      },
    },
    orderBy: [{ item: { name: "asc" } }, { version: "asc" }],
  }) as any
}

export async function getRoutingById(id: string): Promise<RoutingWithDetails | null> {
  return prisma.routing.findUnique({
    where: { id },
    include: {
      item: { include: { category: true } },
      operations: {
        include: { workCenter: true },
        orderBy: { seq: "asc" },
      },
    },
  }) as any
}

export async function getItemsForRouting() {
  return prisma.item.findMany({
    where: { itemType: { in: ["FINISHED", "SEMI_FINISHED"] } },
    select: { id: true, code: true, name: true, itemType: true },
    orderBy: { code: "asc" },
  })
}

export async function getWorkCenters() {
  return prisma.workCenter.findMany({
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
  itemId: string
  version: string
  isDefault: boolean
  status: RoutingStatus
  operations: RoutingOperationInput[]
}

export async function createRouting(data: CreateRoutingInput, tenantId: string) {
  const { operations, ...routingFields } = data
  await prisma.routing.create({
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
  revalidatePath("/app/mes/routing")
}

export async function updateRouting(id: string, data: CreateRoutingInput) {
  const { operations, ...routingFields } = data
  const { itemId, version, isDefault, status } = routingFields
  await prisma.$transaction([
    prisma.routingOperation.deleteMany({ where: { routingId: id } }),
    prisma.routing.update({
      where: { id },
      data: {
        itemId,
        version,
        isDefault,
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
    }),
  ])
  revalidatePath("/app/mes/routing")
}

export async function deleteRouting(id: string) {
  await prisma.$transaction([
    prisma.routingOperation.deleteMany({ where: { routingId: id } }),
    prisma.routing.delete({ where: { id } }),
  ])
  revalidatePath("/app/mes/routing")
}
