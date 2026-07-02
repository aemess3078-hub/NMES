// 품목 선택 일괄삭제 전용 참조 확인 헬퍼.
//
// 이 파일은 절대 "use server"를 붙이지 않는다 — Client Component에서 import하지 말 것.
// "use server" 서버 액션 파일(item.actions.ts 등)에서만 import해서 사용한다.
//
// "use server" 파일 안에서 비동기(async)가 아닌 함수 리터럴을 다른 모듈로 전달/전달받으면
// Next.js 서버 액션 컴파일러가 이를 액션 참조로 오인해 빌드 산출물에 따라
// "A 'use server' file can only export async functions" 런타임 오류가 날 수 있다.
// 그래서 참조 확인에 필요한 카운트 콜백들은 이 파일 안에서만 정의/호출하고,
// "use server" 파일에는 결과(canDelete/reasons)만 반환하는 단순 async 함수만 노출한다.

import { prisma } from "@/lib/db/prisma"

export type ReferenceCheckResult = {
  canDelete: boolean
  reasons: string[]
}

type ReferenceCheckDefinition = {
  label: string
  count: () => Promise<number>
}

async function buildReferenceCheck(checks: ReferenceCheckDefinition[]): Promise<ReferenceCheckResult> {
  const counts = await Promise.all(checks.map((c) => c.count()))
  const reasons: string[] = []
  checks.forEach((c, i) => {
    if (counts[i] > 0) reasons.push(`${c.label} ${counts[i]}건`)
  })
  return { canDelete: reasons.length === 0, reasons }
}

/**
 * 작업지시/재고/BOM/라우팅/검사/LOT 등 이력 데이터에서 품목 사용 여부를 확인한다.
 * item.actions.ts의 단건 삭제용 checkItemReferences보다 넓은 범위를 확인한다.
 */
export async function checkItemReferencesForBulk(itemId: string, tenantId: string): Promise<ReferenceCheckResult> {
  return buildReferenceCheck([
    { label: "작업지시", count: () => prisma.workOrder.count({ where: { itemId, tenantId } }) },
    { label: "BOM", count: () => prisma.bOM.count({ where: { itemId, tenantId } }) },
    { label: "BOM 구성품", count: () => prisma.bOMItem.count({ where: { componentItemId: itemId } }) },
    { label: "라우팅", count: () => prisma.itemRouting.count({ where: { itemId, tenantId } }) },
    { label: "재고입출고 이력", count: () => prisma.inventoryTransaction.count({ where: { itemId, tenantId } }) },
    { label: "재고 보유", count: () => prisma.inventoryBalance.count({ where: { itemId, tenantId, qtyOnHand: { not: 0 } } }) },
    { label: "LOT", count: () => prisma.lot.count({ where: { itemId, tenantId } }) },
    { label: "검사 규격", count: () => prisma.inspectionSpec.count({ where: { itemId, tenantId } }) },
    { label: "자재예약", count: () => prisma.materialReservation.count({ where: { itemId } }) },
    { label: "자재소비 이력", count: () => prisma.materialConsumption.count({ where: { itemId } }) },
    { label: "WIP 이력", count: () => prisma.wipUnit.count({ where: { itemId, tenantId } }) },
    { label: "완성품입고", count: () => prisma.finishedGoodsReceipt.count({ where: { itemId, tenantId } }) },
    { label: "생산계획", count: () => prisma.productionPlanItem.count({ where: { itemId } }) },
    { label: "판매주문", count: () => prisma.salesOrderItem.count({ where: { itemId } }) },
    { label: "구매주문", count: () => prisma.purchaseOrderItem.count({ where: { itemId } }) },
    { label: "견적", count: () => prisma.quotationItem.count({ where: { itemId } }) },
    { label: "원가정보", count: () => prisma.itemCost.count({ where: { itemId, tenantId } }) },
    { label: "ECN", count: () => prisma.engineeringChange.count({ where: { targetItemId: itemId, tenantId } }) },
    { label: "대체품 설정", count: () => prisma.itemSubstitute.count({ where: { OR: [{ itemId }, { substituteItemId: itemId }] } }) },
    { label: "자재LOT 사용", count: () => prisma.workOrderMaterialLot.count({ where: { materialItemId: itemId, tenantId } }) },
  ])
}
