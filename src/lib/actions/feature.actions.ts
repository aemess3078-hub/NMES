"use server"

import { enableFeature, disableFeature, getFeatureCatalog } from "@/lib/services/feature.service"
import { revalidatePath } from "next/cache"

export async function getCatalogWithStatus(tenantId: string) {
  const catalog = await getFeatureCatalog()

  return catalog.map((feature) => ({
    ...feature,
    isEnabled: true,
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
