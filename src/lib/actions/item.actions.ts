"use server"

import { prisma } from "@/lib/db/prisma"
import { Prisma } from "@prisma/client"

export type ItemWithCategory = Prisma.ItemGetPayload<{
  include: { category: true }
}>

export async function getItems(): Promise<ItemWithCategory[]> {
  return prisma.item.findMany({
    include: { category: true },
    orderBy: { code: "asc" },
  })
}

export async function getItemCategories() {
  return prisma.itemCategory.findMany({
    orderBy: { code: "asc" },
  })
}
