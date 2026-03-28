"use server"

import { prisma } from "@/lib/db/prisma"
import { cookies } from "next/headers"
import { calculateMRP } from "@/lib/services/mrp.service"
import { suggestOptimalOrder } from "@/lib/services/mrp-ai.service"
import type { MRPResult } from "@/lib/services/mrp.service"

async function getTenantId(): Promise<string> {
  const cookieStore = await cookies()
  return cookieStore.get("tenantId")?.value ?? "tenant-demo-001"
}

export async function getPlansForMRP() {
  const tenantId = await getTenantId()

  return prisma.productionPlan.findMany({
    where: {
      tenantId,
      status: { in: ["CONFIRMED", "IN_PROGRESS"] },
    },
    include: {
      site: true,
      items: { include: { item: true } },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function runMRP(planId: string): Promise<MRPResult> {
  return calculateMRP(planId)
}

export async function getAISuggestion(mrpResult: MRPResult) {
  const tenantId = await getTenantId()
  return suggestOptimalOrder(mrpResult, tenantId)
}

export async function createPurchaseOrdersFromMRP(
  items: { itemId: string; qty: number }[],
  tenantId: string,
  siteId: string
): Promise<{ success: boolean; orderNo?: string; error?: string }> {
  try {
    if (items.length === 0) {
      return { success: false, error: "발주할 자재가 없습니다." }
    }

    // 공급사 자동 선택: 등록된 첫 번째 SUPPLIER
    const defaultSupplier = await prisma.businessPartner.findFirst({
      where: { tenantId, partnerType: { in: ["SUPPLIER", "BOTH"] } },
    })
    if (!defaultSupplier) {
      return { success: false, error: "등록된 공급사가 없습니다." }
    }

    const orderNo = `PO-MRP-${Date.now()}`

    await prisma.purchaseOrder.create({
      data: {
        tenantId,
        siteId,
        supplierId: defaultSupplier.id,
        orderNo,
        orderDate: new Date(),
        expectedDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2주 후
        status: "DRAFT",
        currency: "KRW",
        note: "MRP 자동 생성 발주",
        items: {
          create: items.map((item) => ({
            itemId: item.itemId,
            qty: item.qty,
            unitPrice: 0,
            stockAtOrder: 0,
          })),
        },
      },
    })

    return { success: true, orderNo }
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "발주 생성 실패",
    }
  }
}
