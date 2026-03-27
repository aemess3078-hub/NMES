"use server"

import { enableFeature, disableFeature, getFeatureCatalog } from "@/lib/services/feature.service"
import { prisma } from "@/lib/db/prisma"
import { revalidatePath } from "next/cache"

export async function getCatalogWithStatus(tenantId: string) {
  const [catalog, tenantFeatures] = await Promise.all([
    getFeatureCatalog(),
    prisma.tenantFeature.findMany({ where: { tenantId }, include: { feature: true } }),
  ])

  const statusMap = Object.fromEntries(
    tenantFeatures.map((tf) => [tf.feature.code, tf.isEnabled])
  )

  return catalog.map((f) => ({
    ...f,
    isEnabled: statusMap[f.code] ?? false,
  }))
}

export async function enableFeatureAction(tenantId: string, featureCode: string) {
  const result = await enableFeature(tenantId, featureCode)
  revalidatePath("/app/mes/features")
  revalidatePath("/app/mes")
  return result
}

export async function disableFeatureAction(tenantId: string, featureCode: string) {
  const result = await disableFeature(tenantId, featureCode)
  revalidatePath("/app/mes/features")
  revalidatePath("/app/mes")
  return result
}
