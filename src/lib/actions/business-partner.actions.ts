"use server"

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
  const where: Prisma.BusinessPartnerWhereInput = {}
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

export async function createBusinessPartner(tenantId: string, data: BusinessPartnerFormValues): Promise<BusinessPartner> {
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
  const existing = await prisma.businessPartner.findFirst({
    where: { code: data.code, NOT: { id } },
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
  await prisma.businessPartner.delete({ where: { id } })
}
