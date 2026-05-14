"use server"

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
    standardTime: any // Decimal
    workCenter: { id: string; code: string; name: string }
  }[]
}

export async function getRoutings(): Promise<RoutingWithDetails[]> {
  return prisma.routing.findMany({
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
  return prisma.routing.findUnique({
    where: { id },
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
  code: string
  name: string
  version: string
  status: RoutingStatus
  // ItemRouting 생성용
  itemId: string
  isDefault: boolean
  operations: RoutingOperationInput[]
}

export async function createRouting(data: CreateRoutingInput, tenantId: string) {
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
  const { operations, itemId, isDefault, ...routingFields } = data
  const { code, name, version, status } = routingFields

  await prisma.$transaction(async (tx) => {
    // 기존 공정 삭제 후 재생성
    await tx.routingOperation.deleteMany({ where: { routingId: id } })

    await tx.routing.update({
      where: { id },
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

    // ItemRouting upsert: itemId+routingId 기준으로 isDefault 갱신 또는 신규 생성
    const routing = await tx.routing.findUnique({
      where: { id },
      select: { tenantId: true },
    })

    if (routing) {
      await tx.itemRouting.upsert({
        where: { itemId_routingId: { itemId, routingId: id } },
        create: {
          tenantId: routing.tenantId,
          itemId,
          routingId: id,
          isDefault,
        },
        update: { isDefault },
      })
    }
  })

  revalidatePath("/app/mes/routing")
}

export async function deleteRouting(id: string) {
  await prisma.$transaction([
    prisma.itemRouting.deleteMany({ where: { routingId: id } }),
    prisma.routingOperation.deleteMany({ where: { routingId: id } }),
    prisma.routing.delete({ where: { id } }),
  ])
  revalidatePath("/app/mes/routing")
}
