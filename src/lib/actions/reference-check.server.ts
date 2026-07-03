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
import { getCurrentUser, requireRole, type CurrentUser } from "@/lib/auth"
import { isDeveloperUser } from "@/lib/developer"

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
 * 기준정보 선택 일괄삭제 공통 권한: ADMIN 이상, 또는 role 계층과 무관한
 * 개발자 계정(loginId='test'). 품목관리 선택삭제에서 쓰던 정책을 그대로 재사용한다.
 */
export async function requireBulkDeletePermission(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) throw new Error("UNAUTHORIZED")
  if (isDeveloperUser(user)) return user
  return requireRole("ADMIN", user)
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

/**
 * 로케이션관리(실제 모델은 Warehouse) 선택 일괄삭제 참조 확인.
 * warehouseId를 참조하는 모든 FK(세부 로케이션/품목 기본창고/재고/입출고이력/WIP/완성품입고/출하)를 확인한다.
 */
export async function checkWarehouseReferencesForBulk(warehouseId: string, tenantId: string): Promise<ReferenceCheckResult> {
  return buildReferenceCheck([
    { label: "세부 로케이션", count: () => prisma.location.count({ where: { warehouseId } }) },
    { label: "기본 입고창고로 지정된 품목", count: () => prisma.item.count({ where: { defaultWarehouseId: warehouseId, tenantId } }) },
    { label: "재고 보유", count: () => prisma.inventoryBalance.count({ where: { warehouseId, tenantId } }) },
    { label: "재고입출고 이력", count: () => prisma.inventoryTransaction.count({ where: { tenantId, OR: [{ fromLocationId: warehouseId }, { toLocationId: warehouseId }] } }) },
    { label: "WIP 현재위치", count: () => prisma.wipUnit.count({ where: { currentWarehouseId: warehouseId, tenantId } }) },
    { label: "WIP 이동이력", count: () => prisma.wipMovement.count({ where: { tenantId, OR: [{ fromWarehouseId: warehouseId }, { toWarehouseId: warehouseId }] } }) },
    { label: "완성품입고", count: () => prisma.finishedGoodsReceipt.count({ where: { warehouseId, tenantId } }) },
    { label: "출하", count: () => prisma.shipmentOrder.count({ where: { warehouseId, tenantId } }) },
  ])
}

/** 불량관리(DefectCode) 선택 일괄삭제 참조 확인. */
export async function checkDefectCodeReferencesForBulk(defectCodeId: string): Promise<ReferenceCheckResult> {
  return buildReferenceCheck([
    { label: "불량이력", count: () => prisma.defectRecord.count({ where: { defectCodeId } }) },
  ])
}

/**
 * 비가동사유관리(CommonCode, groupCode='DOWNTIME_REASON') 선택 일괄삭제 참조 확인.
 * 현재 스키마상 CommonCode를 직접 참조하는 FK가 없다(EquipmentEvent 등 아직 미연결).
 * 향후 연결이 추가되면 여기에 카운트를 더한다.
 */
export async function checkDowntimeReasonReferencesForBulk(): Promise<ReferenceCheckResult> {
  return buildReferenceCheck([])
}

/**
 * 금형/치공구관리(Equipment, equipmentType in TOOL/JIG/FIXTURE) 선택 일괄삭제 참조 확인.
 * 기존 단건삭제(deleteMold)보다 넓은 범위(설비-공정 매핑/작업지시 공정/설비연결/설비이벤트/
 * 수리요청/일상점검/작업배정)를 확인한다.
 */
export async function checkMoldReferencesForBulk(equipmentId: string, tenantId: string): Promise<ReferenceCheckResult> {
  return buildReferenceCheck([
    { label: "설비-공정 매핑", count: () => prisma.equipmentOperationMap.count({ where: { equipmentId } }) },
    { label: "작업지시 공정", count: () => prisma.workOrderOperation.count({ where: { equipmentId } }) },
    { label: "설비연결 설정", count: () => prisma.equipmentConnection.count({ where: { equipmentId } }) },
    { label: "설비이벤트", count: () => prisma.equipmentEvent.count({ where: { equipmentId } }) },
    { label: "수리요청", count: () => prisma.equipmentRepairRequest.count({ where: { equipmentId, tenantId } }) },
    { label: "일상점검", count: () => prisma.equipmentDailyCheck.count({ where: { equipmentId, tenantId } }) },
    { label: "작업배정", count: () => prisma.workOrderOperationAssignment.count({ where: { equipmentId, tenantId } }) },
  ])
}
