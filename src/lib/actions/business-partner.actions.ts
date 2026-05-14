"use server"

import { requireTenantContext } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { Prisma, PartnerType, PartnerStatus } from "@prisma/client"

export type BusinessPartner = {
  id: string
  tenantId: string
  code: string
  name: string
  partnerType: PartnerType
  status: PartnerStatus
}

export type BusinessPartnerFormValues = {
  code: string
  name: string
  partnerType: PartnerType
  status: PartnerStatus
}

export async function getBusinessPartners(type?: "CUSTOMER" | "SUPPLIER"): Promise<BusinessPartner[]> {
  const { tenantId } = await requireTenantContext()

  const where: Prisma.BusinessPartnerWhereInput = { tenantId }
  if (type === "CUSTOMER") {
    where.partnerType = { in: [PartnerType.CUSTOMER, PartnerType.BOTH] }
  } else if (type === "SUPPLIER") {
    where.partnerType = { in: [PartnerType.SUPPLIER, PartnerType.BOTH] }
  }

  return prisma.businessPartner.findMany({
    where,
    orderBy: { code: "asc" },
  })
}

export async function createBusinessPartner(data: BusinessPartnerFormValues): Promise<BusinessPartner> {
  const { tenantId } = await requireTenantContext()

  const existing = await prisma.businessPartner.findFirst({
    where: { tenantId, code: data.code },
  })
  if (existing) throw new Error("DUPLICATE_CODE")

  return prisma.businessPartner.create({
    data: {
      tenantId,
      code: data.code,
      name: data.name,
      partnerType: data.partnerType,
      status: data.status,
    },
  })
}

export async function updateBusinessPartner(id: string, data: BusinessPartnerFormValues): Promise<BusinessPartner> {
  const { tenantId } = await requireTenantContext()

  const existing = await prisma.businessPartner.findFirst({
    where: { tenantId, code: data.code, NOT: { id } },
  })
  if (existing) throw new Error("DUPLICATE_CODE")

  return prisma.businessPartner.update({
    where: { id },
    data: {
      code: data.code,
      name: data.name,
      partnerType: data.partnerType,
      status: data.status,
    },
  })
}

export async function deleteBusinessPartner(id: string): Promise<void> {
  await requireTenantContext()
  await prisma.businessPartner.delete({ where: { id } })
}
