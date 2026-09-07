import { readFileSync } from "node:fs"
import { join } from "node:path"
import { reconcileProductionPlanItems } from "../src/lib/production-plan-item-reconciliation"

let passed = 0
let failed = 0

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++
  } else {
    failed++
    console.error(`FAIL: ${label}`)
  }
}

function assertThrows(run: () => unknown, message: string, label: string) {
  try {
    run()
    assert(false, label)
  } catch (error) {
    assert(error instanceof Error && error.message === message, label)
  }
}

const tenantId = "tenant-cheongun"
const existingItems = [
  {
    id: "plan-item-a",
    itemId: "shared-item",
    salesOrderItemId: "sales-item-a",
    salesOrderItemTenantId: tenantId,
  },
  {
    id: "plan-item-b",
    itemId: "shared-item",
    salesOrderItemId: "sales-item-b",
    salesOrderItemTenantId: tenantId,
  },
  {
    id: "plan-item-manual",
    itemId: "manual-item",
    salesOrderItemId: null,
    salesOrderItemTenantId: null,
  },
]

const preserved = reconcileProductionPlanItems(tenantId, existingItems, [
  {
    productionPlanItemId: "plan-item-a",
    itemId: "shared-item",
    salesOrderItemId: "sales-item-a",
  },
  {
    productionPlanItemId: "plan-item-b",
    itemId: "shared-item",
    salesOrderItemId: "sales-item-b",
  },
  {
    productionPlanItemId: "plan-item-manual",
    itemId: "manual-item",
    salesOrderItemId: null,
  },
])

assert(
  JSON.stringify(preserved.updateIds) ===
    JSON.stringify(["plan-item-a", "plan-item-b", "plan-item-manual"]),
  "서로 다른 수주의 동일 품목 행도 각 ProductionPlanItem ID로 보존"
)
assert(preserved.createIndexes.length === 0, "기존 행 편집은 신규 행을 만들지 않음")
assert(preserved.deleteIds.length === 0, "모든 기존 행을 제출하면 삭제하지 않음")

const addedAndRemoved = reconcileProductionPlanItems(tenantId, existingItems, [
  {
    productionPlanItemId: "plan-item-a",
    itemId: "shared-item",
    salesOrderItemId: "sales-item-a",
  },
  { itemId: "new-manual-item", salesOrderItemId: null },
])
assert(
  JSON.stringify(addedAndRemoved.createIndexes) === JSON.stringify([1]),
  "식별자 없는 추가 행은 수주 연결 없는 신규 행으로 분류"
)
assert(
  JSON.stringify(addedAndRemoved.deleteIds) ===
    JSON.stringify(["plan-item-b", "plan-item-manual"]),
  "제거된 기존 행만 삭제 대상으로 분류"
)

assertThrows(
  () =>
    reconcileProductionPlanItems(tenantId, existingItems, [
      {
        productionPlanItemId: "plan-item-a",
        itemId: "shared-item",
        salesOrderItemId: "sales-item-b",
      },
    ]),
  "수주 품목 연결은 변경할 수 없습니다.",
  "다른 수주품목 ID 주입 거절"
)
assertThrows(
  () =>
    reconcileProductionPlanItems(tenantId, existingItems, [
      {
        productionPlanItemId: "missing-plan-item",
        itemId: "shared-item",
        salesOrderItemId: "sales-item-a",
      },
    ]),
  "현재 생산계획에 속하지 않은 품목은 수정할 수 없습니다.",
  "존재하지 않거나 다른 계획의 ProductionPlanItem ID 거절"
)
assertThrows(
  () =>
    reconcileProductionPlanItems(tenantId, existingItems, [
      { itemId: "new-item", salesOrderItemId: "cross-tenant-sales-item" },
    ]),
  "새 생산계획 품목에 수주 연결을 직접 지정할 수 없습니다.",
  "신규 행의 교차 테넌트 수주품목 ID 주입 거절"
)
assertThrows(
  () =>
    reconcileProductionPlanItems(
      tenantId,
      [
        {
          id: "corrupt-plan-item",
          itemId: "item-a",
          salesOrderItemId: "sales-item-cross-tenant",
          salesOrderItemTenantId: "tenant-other",
        },
      ],
      [
        {
          productionPlanItemId: "corrupt-plan-item",
          itemId: "item-a",
          salesOrderItemId: "sales-item-cross-tenant",
        },
      ]
    ),
  "다른 테넌트의 수주 품목을 생산계획에 연결할 수 없습니다.",
  "기존 데이터의 교차 테넌트 연결도 거절"
)
assertThrows(
  () =>
    reconcileProductionPlanItems(tenantId, existingItems, [
      {
        productionPlanItemId: "plan-item-a",
        itemId: "different-item",
        salesOrderItemId: "sales-item-a",
      },
    ]),
  "수주와 연결된 생산계획 품목은 다른 품목으로 변경할 수 없습니다.",
  "수주 연결 행의 품목 변경 거절"
)

const actionSource = readFileSync(
  join(process.cwd(), "src/lib/actions/production-plan.actions.ts"),
  "utf8"
)
const updatePlanSource = actionSource.slice(
  actionSource.indexOf("export async function updatePlan"),
  actionSource.indexOf("export async function deletePlan")
)
assert(
  !updatePlanSource.includes("productionPlanItem.deleteMany({ where: { planId: id } })"),
  "updatePlan의 전체 삭제 후 재생성 경로 제거"
)
assert(
  updatePlanSource.includes("salesOrderItemId: null") &&
    updatePlanSource.includes("tx.productionPlanItem.update"),
  "신규 수동 행은 null 연결로 생성하고 기존 행은 update"
)
assert(
  updatePlanSource.includes("bomId: item.bomId ?? null") &&
    updatePlanSource.includes("routingId: item.routingId ?? null") &&
    updatePlanSource.includes("plannedQty: item.plannedQty") &&
    updatePlanSource.includes("startDate: new Date(startDate)") &&
    updatePlanSource.includes("endDate: new Date(endDate)"),
  "BOM·라우팅·수량·기간 수정 경로 유지"
)

const formSource = readFileSync(
  join(process.cwd(), "src/app/app/mes/production-plan/plan-form-sheet.tsx"),
  "utf8"
)
assert(
  formSource.includes("productionPlanItemId: item.id") &&
    formSource.includes("salesOrderItemId: item.salesOrderItemId"),
  "편집 폼이 기존 행 ID와 정확한 수주품목 ID를 전달"
)

const workOrderSource = readFileSync(
  join(process.cwd(), "src/lib/actions/work-order.actions.ts"),
  "utf8"
)
assert(
  workOrderSource.includes("validateProductionPlanItemForWorkOrder") &&
    workOrderSource.includes("id: productionPlanItemId") &&
    workOrderSource.includes("productionPlanItem?.planId"),
  "작업지시의 ProductionPlanItem 연결 검증 경로 유지"
)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
