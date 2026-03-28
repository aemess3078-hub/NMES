import { prisma } from "@/lib/db/prisma"

export async function getProductionSummary(tenantId: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [totalWO, activeWO, completedWO, todayResults] = await Promise.all([
    prisma.workOrder.count({ where: { tenantId } }),
    prisma.workOrder.count({ where: { tenantId, status: "IN_PROGRESS" } }),
    prisma.workOrder.count({ where: { tenantId, status: "COMPLETED" } }),
    prisma.productionResult.findMany({
      where: {
        workOrderOperation: { workOrder: { tenantId } },
        startedAt: { gte: today },
      },
      select: { goodQty: true, defectQty: true, reworkQty: true },
    }),
  ])

  const todayGood = todayResults.reduce((s, r) => s + Number(r.goodQty), 0)
  const todayDefect = todayResults.reduce((s, r) => s + Number(r.defectQty), 0)
  const yieldRate =
    todayGood + todayDefect > 0
      ? ((todayGood / (todayGood + todayDefect)) * 100).toFixed(1)
      : "데이터 없음"

  return {
    총작업지시: totalWO,
    진행중: activeWO,
    완료: completedWO,
    오늘양품: todayGood,
    오늘불량: todayDefect,
    양품률: yieldRate + "%",
  }
}

export async function getInventorySummary(tenantId: string) {
  const balances = await prisma.inventoryBalance.findMany({
    where: { tenantId },
    include: { item: { select: { code: true, name: true, itemType: true } } },
  })
  const totalItems = new Set(balances.map((b) => b.itemId)).size
  const lowStock = balances.filter((b) => Number(b.qtyAvailable) < 10)
  return {
    총품목수: totalItems,
    총재고행: balances.length,
    부족재고: lowStock.map((b) => ({
      품목: b.item.name,
      가용: Number(b.qtyAvailable),
    })),
  }
}

export async function getSalesOrderSummary(tenantId: string) {
  const [total, confirmed, inProd, shipped] = await Promise.all([
    prisma.salesOrder.count({ where: { tenantId } }),
    prisma.salesOrder.count({ where: { tenantId, status: "CONFIRMED" } }),
    prisma.salesOrder.count({ where: { tenantId, status: "IN_PRODUCTION" } }),
    prisma.salesOrder.count({ where: { tenantId, status: "SHIPPED" } }),
  ])
  const sevenDaysLater = new Date()
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7)
  const urgent = await prisma.salesOrder.count({
    where: {
      tenantId,
      deliveryDate: { lte: sevenDaysLater },
      status: { notIn: ["SHIPPED", "CLOSED", "CANCELLED"] },
    },
  })
  return { 총수주: total, 확정: confirmed, 생산중: inProd, 출하완료: shipped, 납기임박7일내: urgent }
}

export async function getEquipmentSummary(tenantId: string) {
  const equipments = await prisma.equipment.findMany({
    where: { tenantId },
    select: { name: true, status: true },
  })
  const statusCounts = equipments.reduce(
    (acc, eq) => {
      acc[eq.status] = (acc[eq.status] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )
  return { 총설비: equipments.length, 상태별: statusCounts }
}

export async function getQualitySummary(tenantId: string) {
  const [totalInspections, passCount, failCount] = await Promise.all([
    prisma.qualityInspection.count({
      where: { workOrderOperation: { workOrder: { tenantId } } },
    }),
    prisma.qualityInspection.count({
      where: { workOrderOperation: { workOrder: { tenantId } }, result: "PASS" },
    }),
    prisma.qualityInspection.count({
      where: { workOrderOperation: { workOrder: { tenantId } }, result: "FAIL" },
    }),
  ])
  return { 총검사: totalInspections, 합격: passCount, 불합격: failCount }
}
