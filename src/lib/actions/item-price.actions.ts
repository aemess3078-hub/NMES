"use server"

import { requireTenantContext } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"

// ─── Query Functions ──────────────────────────────────────────────────────────

export async function getItemPrices(_tenantId?: string) {
  const { tenantId } = await requireTenantContext()
  return prisma.itemPrice.findMany({
    where: { tenantId },
    include: { item: true, partner: true },
    orderBy: { createdAt: "desc" },
  })
}

export async function getAllPartners(_tenantId?: string) {
  const { tenantId } = await requireTenantContext()
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

export async function createItemPrice(_tenantId: string, data: CreateItemPriceInput) {
  const { tenantId } = await requireTenantContext()
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
  const { tenantId } = await requireTenantContext()
  const result = await prisma.itemPrice.updateMany({ where: { id, tenantId }, data })
  if (result.count === 0) throw new Error("Item price not found in tenant scope")
  revalidatePath("/app/mes/item-prices")
}

export async function deleteItemPrice(id: string) {
  const { tenantId } = await requireTenantContext()
  const result = await prisma.itemPrice.deleteMany({ where: { id, tenantId } })
  if (result.count === 0) throw new Error("Item price not found in tenant scope")
  revalidatePath("/app/mes/item-prices")
}
