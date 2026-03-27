"use server"

import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"

// ─── Query Functions ──────────────────────────────────────────────────────────

export async function getItemPrices(tenantId: string) {
  return prisma.itemPrice.findMany({
    where: { tenantId },
    include: { item: true, partner: true },
    orderBy: { createdAt: "desc" },
  })
}

export async function getAllPartners(tenantId: string) {
  return prisma.businessPartner.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
  })
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export type CreateItemPriceInput = {
  itemId: string
  partnerId: string
  priceType: string
  unitPrice: number
  currency: string
  effectiveFrom: Date
  effectiveTo?: Date
  note?: string
}

export async function createItemPrice(tenantId: string, data: CreateItemPriceInput) {
  await prisma.itemPrice.create({
    data: { tenantId, ...data },
  })
  revalidatePath("/app/mes/item-prices")
}

export type UpdateItemPriceInput = {
  unitPrice?: number
  currency?: string
  effectiveFrom?: Date
  effectiveTo?: Date | null
  note?: string
}

export async function updateItemPrice(id: string, data: UpdateItemPriceInput) {
  await prisma.itemPrice.update({ where: { id }, data })
  revalidatePath("/app/mes/item-prices")
}

export async function deleteItemPrice(id: string) {
  await prisma.itemPrice.delete({ where: { id } })
  revalidatePath("/app/mes/item-prices")
}
