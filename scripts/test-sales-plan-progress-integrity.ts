import * as fs from "node:fs"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { register } from "tsconfig-paths"
import {
  BOMStatus,
  ItemType,
  PartnerType,
  PlanStatus,
  Prisma,
  RoutingScope,
  RoutingStatus,
  ShipmentStatus,
  SiteType,
  UOM,
  WorkCenterKind,
  WorkOrderStatus,
} from "@prisma/client"
import type { CurrentUser } from "../src/lib/auth"

register({
  baseUrl: process.cwd(),
  paths: { "@/*": ["src/*"] },
})

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = join(process.cwd(), file)
    if (!fs.existsSync(path)) continue
    const lines = fs.readFileSync(path, "utf8").split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const index = trimmed.indexOf("=")
      if (index <= 0) continue
      const key = trimmed.slice(0, index).trim()
      if (process.env[key]) continue
      let value = trimmed.slice(index + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  }
}

let prisma: typeof import("../src/lib/db/prisma").prisma
let getSalesOrderProgressForTenant: typeof import("../src/lib/sales-order-progress.server").getSalesOrderProgressForTenant
let assertProductionPlanCancelable: typeof import("../src/lib/production-plan-cancel.server").assertProductionPlanCancelable
let cancelProductionPlanForTenant: typeof import("../src/lib/production-plan-cancel.server").cancelProductionPlanForTenant

function loadRuntimeModules() {
  prisma = require("../src/lib/db/prisma").prisma
  ;({ getSalesOrderProgressForTenant } = require("../src/lib/sales-order-progress.server") as typeof import("../src/lib/sales-order-progress.server"))
  ;({
    assertProductionPlanCancelable,
    cancelProductionPlanForTenant,
  } = require("../src/lib/production-plan-cancel.server") as typeof import("../src/lib/production-plan-cancel.server"))
}

const REQUIRED_CHEONGUN_REF = "zgjoiyqtfivywajygevj"
const FORBIDDEN_CNS_REF = "rkglajpajtuavmptidur"

let passed = 0
let failed = 0

function assert(condition: boolean, label: string) {
  if (condition) passed++
  else {
    failed++
    console.error(`FAIL: ${label}`)
  }
}

async function assertRejects(run: () => Promise<unknown>, includes: string, label: string) {
  try {
    await run()
    assert(false, label)
  } catch (error) {
    assert(error instanceof Error && error.message.includes(includes), label)
  }
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  assert(Object.is(actual, expected), `${label} (expected=${String(expected)}, actual=${String(actual)})`)
}

function assertDbTarget() {
  const databaseUrl = process.env.DATABASE_URL ?? ""
  assert(databaseUrl.includes(REQUIRED_CHEONGUN_REF), "DATABASE_URL이 청운 Supabase ref를 가리킴")
  assert(!databaseUrl.includes(FORBIDDEN_CNS_REF), "DATABASE_URL에 CNS Supabase ref가 섞이지 않음")
  if (!databaseUrl.includes(REQUIRED_CHEONGUN_REF) || databaseUrl.includes(FORBIDDEN_CNS_REF)) {
    throw new Error("안전 가드 실패: Cheongun DATABASE_URL에서만 F22 무결성 스크립트를 실행할 수 있습니다.")
  }
}

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const prefix = `F22-${suffix}`
const ids: Record<string, string[]> = {
  productionResult: [],
  finishedGoodsReceipt: [],
  shipmentItem: [],
  shipmentOrder: [],
  workOrderOperation: [],
  workOrder: [],
  productionPlanItem: [],
  productionPlan: [],
  salesOrderItem: [],
  salesOrder: [],
  routingOperation: [],
  routing: [],
  bom: [],
  location: [],
  warehouse: [],
  workCenter: [],
  item: [],
  businessPartner: [],
  tenantUser: [],
  profile: [],
  site: [],
  tenant: [],
}

const actor: CurrentUser = {
  id: "",
  profileId: "",
  loginId: `f22-${suffix}`,
  email: `f22-${suffix}@example.invalid`,
  name: "F22 Integrity Test",
  tenantId: "",
  role: "ADMIN",
  isActive: true,
  mustChangePw: false,
}

async function cleanup() {
  if (!Object.values(ids).some((values) => values.length > 0)) return
  try {
    if (ids.tenant.length) {
      await prisma.auditLog.deleteMany({ where: { tenantId: { in: ids.tenant } } })
    }
    await prisma.productionResult.deleteMany({ where: { id: { in: ids.productionResult } } })
    await prisma.finishedGoodsReceipt.deleteMany({ where: { id: { in: ids.finishedGoodsReceipt } } })
    await prisma.shipmentItem.deleteMany({ where: { id: { in: ids.shipmentItem } } })
    await prisma.shipmentOrder.deleteMany({ where: { id: { in: ids.shipmentOrder } } })
    await prisma.workOrderOperation.deleteMany({ where: { id: { in: ids.workOrderOperation } } })
    await prisma.workOrder.deleteMany({ where: { id: { in: ids.workOrder } } })
    await prisma.productionPlanItem.deleteMany({ where: { id: { in: ids.productionPlanItem } } })
    await prisma.productionPlan.deleteMany({ where: { id: { in: ids.productionPlan } } })
    await prisma.salesOrderItem.deleteMany({ where: { id: { in: ids.salesOrderItem } } })
    await prisma.salesOrder.deleteMany({ where: { id: { in: ids.salesOrder } } })
    await prisma.routingOperation.deleteMany({ where: { id: { in: ids.routingOperation } } })
    await prisma.routing.deleteMany({ where: { id: { in: ids.routing } } })
    await prisma.bOM.deleteMany({ where: { id: { in: ids.bom } } })
    await prisma.location.deleteMany({ where: { id: { in: ids.location } } })
    await prisma.warehouse.deleteMany({ where: { id: { in: ids.warehouse } } })
    await prisma.workCenter.deleteMany({ where: { id: { in: ids.workCenter } } })
    await prisma.item.deleteMany({ where: { id: { in: ids.item } } })
    await prisma.businessPartner.deleteMany({ where: { id: { in: ids.businessPartner } } })
    await prisma.tenantUser.deleteMany({ where: { id: { in: ids.tenantUser } } })
    await prisma.profile.deleteMany({ where: { id: { in: ids.profile } } })
    await prisma.site.deleteMany({ where: { id: { in: ids.site } } })
    await prisma.tenant.deleteMany({ where: { id: { in: ids.tenant } } })
  } catch (error) {
    console.error("cleanup failed", error)
    throw error
  }
}

async function createFixture() {
  const tenant = await prisma.tenant.create({ data: { code: prefix, name: `F22 Test ${suffix}` } })
  ids.tenant.push(tenant.id)
  actor.tenantId = tenant.id

  const site = await prisma.site.create({
    data: { tenantId: tenant.id, code: `${prefix}-SITE`, name: "F22 Site", type: SiteType.FACTORY },
  })
  ids.site.push(site.id)

  const profile = await prisma.profile.create({
    data: { email: actor.email, name: actor.name },
  })
  ids.profile.push(profile.id)
  actor.id = profile.id
  actor.profileId = profile.id

  const tenantUser = await prisma.tenantUser.create({
    data: { tenantId: tenant.id, profileId: profile.id, siteId: site.id, role: "ADMIN" },
  })
  ids.tenantUser.push(tenantUser.id)

  const customer = await prisma.businessPartner.create({
    data: {
      tenantId: tenant.id,
      code: `${prefix}-CUST`,
      name: "F22 Customer",
      partnerType: PartnerType.CUSTOMER,
    },
  })
  ids.businessPartner.push(customer.id)

  const item = await prisma.item.create({
    data: {
      tenantId: tenant.id,
      code: `${prefix}-FG`,
      name: "F22 Finished Good",
      itemType: ItemType.FINISHED,
      uom: UOM.EA,
    },
  })
  ids.item.push(item.id)

  const workCenter = await prisma.workCenter.create({
    data: { siteId: site.id, code: `${prefix}-WC`, name: "F22 Work Center", kind: WorkCenterKind.ASSEMBLY },
  })
  ids.workCenter.push(workCenter.id)

  const routing = await prisma.routing.create({
    data: {
      tenantId: tenant.id,
      code: `${prefix}-RT`,
      name: "F22 Routing",
      version: "1",
      status: RoutingStatus.ACTIVE,
      scope: RoutingScope.COMMON,
    },
  })
  ids.routing.push(routing.id)

  const op1 = await prisma.routingOperation.create({
    data: { routingId: routing.id, workCenterId: workCenter.id, seq: 10, operationCode: `${prefix}-10`, name: "First" },
  })
  const op2 = await prisma.routingOperation.create({
    data: { routingId: routing.id, workCenterId: workCenter.id, seq: 20, operationCode: `${prefix}-20`, name: "Final" },
  })
  ids.routingOperation.push(op1.id, op2.id)

  const bom = await prisma.bOM.create({
    data: { tenantId: tenant.id, itemId: item.id, version: "1", status: BOMStatus.ACTIVE, isDefault: true },
  })
  ids.bom.push(bom.id)

  const warehouse = await prisma.warehouse.create({
    data: { tenantId: tenant.id, siteId: site.id, code: `${prefix}-WH`, name: "F22 Warehouse" },
  })
  ids.warehouse.push(warehouse.id)
  const location = await prisma.location.create({
    data: { warehouseId: warehouse.id, code: `${prefix}-LOC`, name: "F22 Location" },
  })
  ids.location.push(location.id)

  const yesterday = new Date("2026-09-27T00:00:00+09:00")
  const nextWeek = new Date("2026-10-05T00:00:00+09:00")

  const salesOrder = await prisma.salesOrder.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      customerId: customer.id,
      orderNo: `${prefix}-SO`,
      orderDate: new Date("2026-09-20T00:00:00+09:00"),
      deliveryDate: nextWeek,
      status: "IN_PRODUCTION",
      items: {
        create: {
          itemId: item.id,
          qty: new Prisma.Decimal(100),
          shippedQty: new Prisma.Decimal(20),
          deliveryDate: yesterday,
        },
      },
    },
    include: { items: true },
  })
  ids.salesOrder.push(salesOrder.id)
  ids.salesOrderItem.push(...salesOrder.items.map((row) => row.id))
  const salesOrderItem = salesOrder.items[0]

  const activePlan = await prisma.productionPlan.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      planNo: `${prefix}-PLAN-A`,
      planType: "DAILY",
      startDate: new Date("2026-09-24T00:00:00+09:00"),
      endDate: new Date("2026-09-30T00:00:00+09:00"),
      status: PlanStatus.CONFIRMED,
      items: { create: { itemId: item.id, bomId: bom.id, routingId: routing.id, plannedQty: 80, salesOrderItemId: salesOrderItem.id } },
    },
    include: { items: true },
  })
  ids.productionPlan.push(activePlan.id)
  ids.productionPlanItem.push(activePlan.items[0].id)
  const activePlanItem = activePlan.items[0]

  const cancelledPlan = await prisma.productionPlan.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      planNo: `${prefix}-PLAN-X`,
      planType: "DAILY",
      startDate: new Date("2026-09-24T00:00:00+09:00"),
      endDate: new Date("2026-09-30T00:00:00+09:00"),
      status: PlanStatus.CANCELLED,
      items: { create: { itemId: item.id, bomId: bom.id, routingId: routing.id, plannedQty: 999, salesOrderItemId: salesOrderItem.id } },
    },
    include: { items: true },
  })
  ids.productionPlan.push(cancelledPlan.id)
  ids.productionPlanItem.push(cancelledPlan.items[0].id)

  const wo1 = await prisma.workOrder.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      itemId: item.id,
      bomId: bom.id,
      routingId: routing.id,
      productionPlanItemId: activePlanItem.id,
      orderNo: `${prefix}-WO-1`,
      plannedQty: 40,
      status: WorkOrderStatus.IN_PROGRESS,
      dueDate: nextWeek,
      operations: {
        create: [
          { routingOperationId: op1.id, seq: 10, plannedQty: 40, completedQty: 33, status: "COMPLETED" },
          { routingOperationId: op2.id, seq: 20, plannedQty: 40, completedQty: 30, status: "IN_PROGRESS" },
        ],
      },
    },
    include: { operations: true },
  })
  ids.workOrder.push(wo1.id)
  ids.workOrderOperation.push(...wo1.operations.map((row) => row.id))

  const wo2 = await prisma.workOrder.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      itemId: item.id,
      bomId: bom.id,
      routingId: routing.id,
      productionPlanItemId: activePlanItem.id,
      orderNo: `${prefix}-WO-2`,
      plannedQty: 10,
      status: WorkOrderStatus.RELEASED,
      dueDate: nextWeek,
      operations: {
        create: [
          { routingOperationId: op1.id, seq: 10, plannedQty: 10, completedQty: 7, status: "IN_PROGRESS" },
        ],
      },
    },
    include: { operations: true },
  })
  ids.workOrder.push(wo2.id)
  ids.workOrderOperation.push(...wo2.operations.map((row) => row.id))

  const cancelledWo = await prisma.workOrder.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      itemId: item.id,
      bomId: bom.id,
      routingId: routing.id,
      productionPlanItemId: activePlanItem.id,
      orderNo: `${prefix}-WO-C`,
      plannedQty: 999,
      status: WorkOrderStatus.CANCELLED,
      dueDate: nextWeek,
    },
  })
  ids.workOrder.push(cancelledWo.id)

  const results = await Promise.all([
    prisma.productionResult.create({ data: { workOrderOperationId: wo1.operations[0].id, goodQty: 33, startedAt: new Date("2026-09-25T01:00:00+09:00") } }),
    prisma.productionResult.create({ data: { workOrderOperationId: wo1.operations[1].id, goodQty: 30, startedAt: new Date("2026-09-26T01:00:00+09:00") } }),
    prisma.productionResult.create({ data: { workOrderOperationId: wo2.operations[0].id, goodQty: 7, startedAt: new Date("2026-09-26T01:00:00+09:00") } }),
  ])
  ids.productionResult.push(...results.map((row) => row.id))

  const receipts = await Promise.all([
    prisma.finishedGoodsReceipt.create({
      data: { tenantId: tenant.id, siteId: site.id, workOrderId: wo1.id, itemId: item.id, warehouseId: warehouse.id, locationId: location.id, receiptQty: 12 },
    }),
    prisma.finishedGoodsReceipt.create({
      data: { tenantId: tenant.id, siteId: site.id, workOrderId: wo2.id, itemId: item.id, warehouseId: warehouse.id, locationId: location.id, receiptQty: 8 },
    }),
  ])
  ids.finishedGoodsReceipt.push(...receipts.map((row) => row.id))

  const plannedShipment = await prisma.shipmentOrder.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      salesOrderId: salesOrder.id,
      shipmentNo: `${prefix}-SHIP-P`,
      status: ShipmentStatus.PLANNED,
      plannedDate: nextWeek,
      items: { create: { salesOrderItemId: salesOrderItem.id, itemId: item.id, qty: 15 } },
    },
    include: { items: true },
  })
  const shippedShipment = await prisma.shipmentOrder.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      salesOrderId: salesOrder.id,
      shipmentNo: `${prefix}-SHIP-S`,
      status: ShipmentStatus.SHIPPED,
      plannedDate: nextWeek,
      shippedDate: new Date("2026-09-26T00:00:00+09:00"),
      items: { create: { salesOrderItemId: salesOrderItem.id, itemId: item.id, qty: 20 } },
    },
    include: { items: true },
  })
  ids.shipmentOrder.push(plannedShipment.id, shippedShipment.id)
  ids.shipmentItem.push(plannedShipment.items[0].id, shippedShipment.items[0].id)

  return { tenant, site, item, bom, routing, op1, salesOrder, salesOrderItem, activePlan, activePlanItem }
}

async function runDbAssertions() {
  const fixture = await createFixture()

  const progress = await getSalesOrderProgressForTenant({
    salesOrderId: fixture.salesOrder.id,
    tenantId: fixture.tenant.id,
    permissions: { canReadProductionPlan: true, canReadWorkOrder: true, canReadShipment: true },
    now: new Date("2026-09-28T12:00:00+09:00"),
  })
  assert(progress != null, "수주 진행상황 조회 성공")
  if (!progress) return
  const item = progress.items[0]
  assertEqual(item.orderedQty, 100, "orderedQty는 SalesOrderItem.qty 사용")
  assertEqual(item.plannedQty, 80, "plannedQty는 CANCELLED 계획 제외")
  assertEqual(item.workOrderQty, 50, "workOrderQty는 CANCELLED 작업지시 제외")
  assertEqual(item.producedQty, 37, "producedQty는 작업지시별 최고 seq 실적만 합산")
  assertEqual(item.finishedGoodsReceiptQty, 20, "finishedGoodsReceiptQty 집계")
  assertEqual(item.plannedShipmentQty, 15, "plannedShipmentQty는 PLANNED 출하만 별도 집계")
  assertEqual(item.shippedQty, 20, "shippedQty는 SalesOrderItem.shippedQty 사용")
  assertEqual(item.remainingQty, 80, "remainingQty는 수주수량-출하수량")
  assertEqual(item.effectiveDeliveryDate, "2026-09-27", "품목별 deliveryDate가 수주 deliveryDate보다 우선")
  assert(item.isOverdue, "KST 기준 납기 경과 및 잔량 존재 시 overdue")
  assertEqual(item.productionStatus, "IN_PROGRESS", "생산상태 표시값 계산")
  assertEqual(item.shipmentStatus, "IN_PROGRESS", "출하상태 표시값 계산")
  assertEqual(item.productionPlans.length, 1, "취소 생산계획 링크 제외")
  assertEqual(item.workOrders.length, 2, "취소 작업지시 링크 제외")
  assertEqual(item.shipments.length, 2, "출하 링크 표시")
  assertEqual(progress.summary.hasOverdueItem, true, "summary overdue 반영")

  const hiddenLinks = await getSalesOrderProgressForTenant({
    salesOrderId: fixture.salesOrder.id,
    tenantId: fixture.tenant.id,
    permissions: { canReadProductionPlan: false, canReadWorkOrder: false, canReadShipment: false },
    now: new Date("2026-09-28T12:00:00+09:00"),
  })
  assert(hiddenLinks?.permissions.canReadProductionPlan === false, "권한 flag가 client 전달 데이터에 반영")

  const otherTenant = await prisma.tenant.create({ data: { code: `${prefix}-OTHER`, name: "F22 Other Tenant" } })
  ids.tenant.push(otherTenant.id)
  const crossTenantProgress = await getSalesOrderProgressForTenant({
    salesOrderId: fixture.salesOrder.id,
    tenantId: otherTenant.id,
    permissions: { canReadProductionPlan: true, canReadWorkOrder: true, canReadShipment: true },
  })
  assert(crossTenantProgress === null, "다른 tenant로 salesOrder progress 조회 불가")

  await assertRejects(
    () => prisma.$transaction((tx) => assertProductionPlanCancelable({ tx, planId: fixture.activePlan.id, tenantId: fixture.tenant.id })),
    "연결된 작업지시가 있습니다",
    "생산계획 취소는 작업지시가 하나라도 있으면 차단"
  )

  const cancelSalesOrder = await prisma.salesOrder.create({
    data: {
      tenantId: fixture.tenant.id,
      siteId: fixture.site.id,
      customerId: (await prisma.businessPartner.findFirstOrThrow({ where: { tenantId: fixture.tenant.id } })).id,
      orderNo: `${prefix}-SO-CANCEL`,
      orderDate: new Date("2026-09-20T00:00:00+09:00"),
      deliveryDate: new Date("2026-10-10T00:00:00+09:00"),
      status: "IN_PRODUCTION",
      items: { create: { itemId: fixture.item.id, qty: 5, shippedQty: 0 } },
    },
    include: { items: true },
  })
  ids.salesOrder.push(cancelSalesOrder.id)
  ids.salesOrderItem.push(cancelSalesOrder.items[0].id)
  const cancelPlan = await prisma.productionPlan.create({
    data: {
      tenantId: fixture.tenant.id,
      siteId: fixture.site.id,
      planNo: `${prefix}-PLAN-CANCEL`,
      planType: "DAILY",
      startDate: new Date("2026-09-28T00:00:00+09:00"),
      endDate: new Date("2026-09-29T00:00:00+09:00"),
      status: PlanStatus.CONFIRMED,
      items: { create: { itemId: fixture.item.id, bomId: fixture.bom.id, routingId: fixture.routing.id, plannedQty: 5, salesOrderItemId: cancelSalesOrder.items[0].id } },
    },
    include: { items: true },
  })
  ids.productionPlan.push(cancelPlan.id)
  ids.productionPlanItem.push(cancelPlan.items[0].id)

  const cancelResult = await prisma.$transaction((tx) =>
    cancelProductionPlanForTenant({
      tx,
      planId: cancelPlan.id,
      tenantId: fixture.tenant.id,
      actor,
      reason: "F22 integrity cancel",
    })
  )
  assertEqual(cancelResult.status, PlanStatus.CANCELLED, "cancelProductionPlanForTenant가 계획 상태를 CANCELLED로 변경")
  const canceledPlanRow = await prisma.productionPlan.findUniqueOrThrow({ where: { id: cancelPlan.id } })
  assertEqual(canceledPlanRow.status, PlanStatus.CANCELLED, "DB 생산계획 상태 CANCELLED 저장")
  const reconciledSalesOrder = await prisma.salesOrder.findUniqueOrThrow({ where: { id: cancelSalesOrder.id } })
  assertEqual(reconciledSalesOrder.status, "CONFIRMED", "활성 계획이 없어지면 IN_PRODUCTION 수주는 CONFIRMED로 되돌림")
  const planAudit = await prisma.auditLog.findFirst({
    where: { tenantId: fixture.tenant.id, entityType: "ProductionPlan", entityId: cancelPlan.id, action: "UPDATE" },
  })
  assert(planAudit != null, "생산계획 취소 AuditLog 기록")
  const salesAudit = await prisma.auditLog.findFirst({
    where: { tenantId: fixture.tenant.id, entityType: "SalesOrder", entityId: cancelSalesOrder.id, action: "UPDATE" },
  })
  assert(salesAudit != null, "생산계획 취소에 따른 SalesOrder AuditLog 기록")
}

function runSourceAssertions() {
  const planActionSource = readFileSync(join(process.cwd(), "src/lib/actions/production-plan.actions.ts"), "utf8")
  const cancelHelperSource = readFileSync(join(process.cwd(), "src/lib/production-plan-cancel.server.ts"), "utf8")
  const progressSource = readFileSync(join(process.cwd(), "src/lib/sales-order-progress.server.ts"), "utf8")
  const salesActionSource = readFileSync(join(process.cwd(), "src/lib/actions/sales-order.actions.ts"), "utf8")
  const detailSheetSource = readFileSync(join(process.cwd(), "src/app/app/mes/sales-orders/sales-order-detail-sheet.tsx"), "utf8")
  const planDetailSource = readFileSync(join(process.cwd(), "src/app/app/mes/production-plan/plan-detail-sheet.tsx"), "utf8")

  assert(!progressSource.includes("ProductionPlan.endDate") && progressSource.includes("item.deliveryDate ?? salesOrder.deliveryDate"), "고객 납기일은 수주/품목 납기에서만 계산")
  assert(progressSource.includes("planItem.plan.status !== PlanStatus.CANCELLED"), "진행상황 집계에서 취소 생산계획 제외")
  assert(progressSource.includes("workOrder.status !== WorkOrderStatus.CANCELLED"), "진행상황 집계에서 취소 작업지시 제외")
  assert(progressSource.includes("computeProductionOutputQty"), "생산실적은 production-progress.service 규칙 재사용")
  assert(progressSource.includes("kstDaysUntil") && progressSource.includes("toKstDateKey"), "납기 초과 판정은 KST helper 사용")
  assert(salesActionSource.includes("requireResourcePermission(\"SALES_ORDER\", \"READ\")"), "수주 진행상황 action은 SALES_ORDER READ 권한 요구")
  assert(salesActionSource.includes("getCurrentPermissionSnapshot"), "관련 링크 권한 flag는 서버에서 계산")
  assert(cancelHelperSource.includes("PlanStatus.DRAFT, PlanStatus.CONFIRMED"), "생산계획 취소 허용 상태 제한")
  assert(cancelHelperSource.includes("_count: { select: { workOrders: true } }") && cancelHelperSource.includes("_count.workOrders > 0"), "작업지시 존재 시 취소 차단")
  assert(cancelHelperSource.includes("cancelReason: reason"), "취소 사유는 AuditLog afterData에 저장")
  assert(planActionSource.includes("export async function cancelProductionPlan") && planActionSource.includes("PRODUCTION_PLAN",), "cancelProductionPlan action 추가")
  assert(planActionSource.includes("if (existing.items.some((item) => item._count.workOrders > 0))"), "deletePlan도 작업지시 연결 시 명시 차단")
  assert(detailSheetSource.includes("생산·출하 진행상황") && detailSheetSource.includes("고객 납기"), "수주 상세 sheet에 진행상황과 고객 납기 표시")
  assert(planDetailSource.includes("계획 기간") && planDetailSource.includes("고객 납기"), "생산계획 상세에서 계획 기간과 고객 납기를 분리 표시")
}

async function main() {
  loadLocalEnv()
  assertDbTarget()
  loadRuntimeModules()
  runSourceAssertions()
  await runDbAssertions()
}

main()
  .catch((error) => {
    failed++
    console.error(error)
  })
  .finally(async () => {
    await cleanup()
    if (prisma) await prisma.$disconnect()
    console.log(`\n${passed} passed, ${failed} failed`)
    if (failed > 0) process.exit(1)
  })



