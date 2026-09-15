import { readFileSync } from "fs"
import { join } from "path"
import assert from "assert"
import ts from "typescript"
import { loadEnvConfig } from "@next/env"
import { Prisma, PrismaClient } from "@prisma/client"

const root = process.cwd()

const Module = require("module")
const originalResolveFilename = Module._resolveFilename
Module._resolveFilename = function resolveAlias(request: string, parent: unknown, isMain: boolean, options: unknown) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, join(root, "src", request.slice(2)), parent, isMain, options)
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

const {
  BUSINESS_NUMBER_MAX_ATTEMPTS,
  isUniqueConstraintError,
  kstDateParts,
  withUniqueBusinessNumberRetry,
} = require("../src/lib/business-numbering") as typeof import("../src/lib/business-numbering")
const {
  generateCnsManufacturingNo,
  generateCnsMaterialReceiptLotNo,
} = require("../src/lib/lot-numbering/lot-number-generator") as typeof import("../src/lib/lot-numbering/lot-number-generator")
const {
  computeNextMaterialReceiptLotNo,
} = require("../src/lib/lot-numbering/lot-reservation") as typeof import("../src/lib/lot-numbering/lot-reservation")
const prisma = new PrismaClient()

function read(path: string) { return readFileSync(join(root, path), "utf8") }
function ok(value: unknown, message: string) { assert.ok(value, message); console.log(`PASS ${message}`) }

function functionBody(source: string, filePath: string, functionName: string): string {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let body = ""
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === functionName && node.body) {
      body = source.slice(node.body.getStart(sourceFile), node.body.end)
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  assert.ok(body, `${filePath} exports ${functionName}`)
  return body
}

function barrier(count: number) {
  let seen = 0
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
  return async () => { seen += 1; if (seen === count) release(); await promise }
}

function prismaUniqueError(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "f19-test",
    meta: { target },
  })
}

async function runRetryTargetChecks() {
  const workOrderTargets = [["tenantId", "orderNo"], ["tenantId", "manufacturingNo"]]

  let orderNoAttempts = 0
  const orderNoResult = await withUniqueBusinessNumberRetry(async (attempt) => {
    orderNoAttempts += 1
    if (attempt === 0) throw prismaUniqueError(["tenantId", "orderNo"])
    return "orderNo retried"
  }, { fields: workOrderTargets, maxAttempts: 2 })
  ok(orderNoResult === "orderNo retried" && orderNoAttempts === 2, "WorkOrder orderNo P2002 is retried")

  let manufacturingNoAttempts = 0
  const manufacturingNoResult = await withUniqueBusinessNumberRetry(async (attempt) => {
    manufacturingNoAttempts += 1
    if (attempt === 0) throw prismaUniqueError(["tenantId", "manufacturingNo"])
    return "manufacturingNo retried"
  }, { fields: workOrderTargets, maxAttempts: 2 })
  ok(manufacturingNoResult === "manufacturingNo retried" && manufacturingNoAttempts === 2, "automatic WorkOrder manufacturingNo P2002 is retried")

  let unrelatedAttempts = 0
  await assert.rejects(
    () => withUniqueBusinessNumberRetry(async () => {
      unrelatedAttempts += 1
      throw prismaUniqueError(["workOrderId", "seq"])
    }, { fields: workOrderTargets, maxAttempts: 3 }),
    Prisma.PrismaClientKnownRequestError,
  )
  ok(unrelatedAttempts === 1, "non-numbering P2002 is not retried as a business number collision")

  let manualAttempts = 0
  const manualError = prismaUniqueError(["tenantId", "manufacturingNo"])
  await assert.rejects(
    () => withUniqueBusinessNumberRetry(async () => {
      manualAttempts += 1
      throw manualError
    }, { fields: [["tenantId", "orderNo"]], maxAttempts: 3 }),
    Prisma.PrismaClientKnownRequestError,
  )
  ok(manualAttempts === 1 && isUniqueConstraintError(manualError, ["tenantId", "manufacturingNo"]), "manual WorkOrder manufacturingNo duplicate is detected without automatic renumber retry")
}

async function cleanup(runId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { code: `F19-${runId}` }, select: { id: true } })
  if (!tenant) {
    await prisma.profile.deleteMany({ where: { email: { contains: `${runId.toLowerCase()}@f19.test` } } })
    return
  }
  const tenantId = tenant.id
  await prisma.materialReturnItem.deleteMany({ where: { materialReturn: { tenantId } } })
  await prisma.materialReturn.deleteMany({ where: { tenantId } })
  await prisma.receivingInspection.deleteMany({ where: { purchaseOrderItem: { purchaseOrder: { tenantId } } } })
  await prisma.lotNumberReservation.deleteMany({ where: { tenantId } })
  await prisma.inventoryTransaction.deleteMany({ where: { tenantId } })
  await prisma.inventoryBalance.deleteMany({ where: { tenantId } })
  await prisma.shipmentItem.deleteMany({ where: { shipmentOrder: { tenantId } } })
  await prisma.shipmentOrder.deleteMany({ where: { tenantId } })
  await prisma.salesOrderItem.deleteMany({ where: { salesOrder: { tenantId } } })
  await prisma.salesOrder.deleteMany({ where: { tenantId } })
  await prisma.workOrderOperation.deleteMany({ where: { workOrder: { tenantId } } })
  await prisma.workOrder.deleteMany({ where: { tenantId } })
  await prisma.productionPlanItem.deleteMany({ where: { plan: { tenantId } } })
  await prisma.productionPlan.deleteMany({ where: { tenantId } })
  await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { tenantId } } })
  await prisma.purchaseOrder.deleteMany({ where: { tenantId } })
  await prisma.lot.deleteMany({ where: { tenantId } })
  await prisma.bOMItem.deleteMany({ where: { bom: { tenantId } } })
  await prisma.bOM.deleteMany({ where: { tenantId } })
  await prisma.itemRouting.deleteMany({ where: { tenantId } })
  await prisma.routingOperation.deleteMany({ where: { routing: { tenantId } } })
  await prisma.routing.deleteMany({ where: { tenantId } })
  await prisma.workCenter.deleteMany({ where: { site: { tenantId } } })
  await prisma.warehouse.deleteMany({ where: { tenantId } })
  await prisma.item.deleteMany({ where: { tenantId } })
  await prisma.businessPartner.deleteMany({ where: { tenantId } })
  await prisma.tenantUser.deleteMany({ where: { tenantId } })
  await prisma.site.deleteMany({ where: { tenantId } })
  await prisma.tenant.deleteMany({ where: { id: tenantId } })
  await prisma.profile.deleteMany({ where: { email: { contains: `${runId.toLowerCase()}@f19.test` } } })
}

async function createFixture(runId: string) {
  await cleanup(runId)
  const tenant = await prisma.tenant.create({ data: { code: `F19-${runId}`, name: `F19 ${runId}` } })
  const site = await prisma.site.create({ data: { tenantId: tenant.id, code: `S-${runId}`, name: `F19 Site ${runId}`, type: "FACTORY" } })
  const profile = await prisma.profile.create({ data: { email: `${runId.toLowerCase()}@f19.test`, name: `F19 ${runId}` } })
  const customer = await prisma.businessPartner.create({ data: { tenantId: tenant.id, code: `CUS-${runId}`, name: "F19 Customer", partnerType: "CUSTOMER" } })
  const supplier = await prisma.businessPartner.create({ data: { tenantId: tenant.id, code: `SUP-${runId}`, name: "F19 Supplier", partnerType: "SUPPLIER" } })
  const warehouse = await prisma.warehouse.create({ data: { tenantId: tenant.id, siteId: site.id, code: `WH-${runId}`, name: "F19 WH" } })
  const fgItem = await prisma.item.create({ data: { tenantId: tenant.id, code: `FG-${runId}`, name: "F19 FG", itemType: "FINISHED", isLotTracked: true, lotNumberingType: "PREFIX_MONTH_SEQ", lotPrefix: `Z${runId.slice(-2)}`, manualLotPolicy: "DISABLED", defaultWarehouseId: warehouse.id } })
  const rawItem = await prisma.item.create({ data: { tenantId: tenant.id, code: `RAW-${runId}`, name: "F19 RAW", itemType: "RAW_MATERIAL", isLotTracked: true, lotNumberingType: "RAW_DATE_SEQ", manualLotPolicy: "ALLOWED", defaultWarehouseId: warehouse.id } })
  const prefixItem = await prisma.item.create({ data: { tenantId: tenant.id, code: `PFX-${runId}`, name: "F19 PFX", itemType: "RAW_MATERIAL", isLotTracked: true, lotNumberingType: "PREFIX_MONTH_SEQ", lotPrefix: `P${runId.slice(-2)}`, manualLotPolicy: "DISABLED", defaultWarehouseId: warehouse.id } })
  const requiredManualItem = await prisma.item.create({ data: { tenantId: tenant.id, code: `MAN-${runId}`, name: "F19 MAN", itemType: "RAW_MATERIAL", isLotTracked: true, lotNumberingType: "MANUAL", manualLotPolicy: "REQUIRED" } })
  const bom = await prisma.bOM.create({ data: { tenantId: tenant.id, itemId: fgItem.id, version: `F19-${runId}`, isDefault: true, status: "ACTIVE" } })
  const workCenter = await prisma.workCenter.create({ data: { siteId: site.id, code: `WC-${runId}`, name: "F19 WC" } })
  const routing = await prisma.routing.create({ data: { tenantId: tenant.id, code: `RT-${runId}`, name: "F19 Routing", version: "1", status: "ACTIVE", scope: "COMMON" } })
  const routingOperation = await prisma.routingOperation.create({ data: { routingId: routing.id, workCenterId: workCenter.id, seq: 1, operationCode: "OP10", name: "F19 OP" } })
  const poForLots = await prisma.purchaseOrder.create({ data: { tenantId: tenant.id, siteId: site.id, supplierId: supplier.id, orderNo: `BASE-${runId}`, orderDate: new Date(), expectedDate: new Date(), status: "ORDERED" } })
  const poItemRaw = await prisma.purchaseOrderItem.create({ data: { purchaseOrderId: poForLots.id, itemId: rawItem.id, qty: 100, unitPrice: 1 } })
  const poItemPrefix = await prisma.purchaseOrderItem.create({ data: { purchaseOrderId: poForLots.id, itemId: prefixItem.id, qty: 100, unitPrice: 1 } })
  return { tenant, site, profile, customer, supplier, warehouse, fgItem, rawItem, prefixItem, requiredManualItem, bom, routing, routingOperation, poForLots, poItemRaw, poItemPrefix }
}

async function nextSimpleNo(model: any, tenantId: string, field: string, prefix: string, width: number) {
  const last = await model.findFirst({ where: { tenantId, [field]: { startsWith: prefix } }, orderBy: { [field]: "desc" }, select: { [field]: true } })
  const value = last?.[field] as string | undefined
  const seq = value ? (parseInt(value.split("-").pop() ?? "0", 10) || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(width, "0")}`
}

async function nextProductionPlanNo(tenantId: string) {
  const parts = kstDateParts()
  const base = `PP-${parts.year}-${parts.monthText}${parts.dayText}`
  const rows = await prisma.productionPlan.findMany({ where: { tenantId, planNo: { startsWith: base } }, select: { planNo: true } })
  const existing = new Set(rows.map((r) => r.planNo))
  if (!existing.has(base)) return base
  let suffix = 2
  while (existing.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

async function runTwo(label: string, createOne: (sync: () => Promise<void>) => Promise<string>) {
  const sync = barrier(2)
  const results = await Promise.all([createOne(sync), createOne(sync)])
  ok(results.length === 2 && new Set(results).size === 2, `${label}: concurrent creates both succeed with distinct numbers (${results.join(", ")})`)
}

async function runDbConcurrencyChecks() {
  const runId = `CN${Date.now().toString().slice(-8)}`
  const f = await createFixture(runId)
  try {
    const parts = kstDateParts()
    await runTwo("SalesOrder", (sync) => withUniqueBusinessNumberRetry(async (attempt) => {
      const orderNo = await nextSimpleNo(prisma.salesOrder, f.tenant.id, "orderNo", `SO-${parts.year}-`, 3)
      if (attempt === 0) await sync()
      const row = await prisma.salesOrder.create({ data: { tenantId: f.tenant.id, siteId: f.site.id, customerId: f.customer.id, orderNo, orderDate: new Date(), deliveryDate: new Date(), status: "DRAFT", items: { create: [{ itemId: f.fgItem.id, qty: 1 }] } } })
      return row.orderNo
    }, { fields: ["tenantId", "orderNo"] }))

    await runTwo("ProductionPlan", (sync) => withUniqueBusinessNumberRetry(async (attempt) => {
      const planNo = await nextProductionPlanNo(f.tenant.id)
      if (attempt === 0) await sync()
      const row = await prisma.productionPlan.create({ data: { tenantId: f.tenant.id, siteId: f.site.id, planNo, planType: "DAILY", startDate: new Date(), endDate: new Date(), status: "DRAFT", items: { create: [{ itemId: f.fgItem.id, plannedQty: 1 }] } } })
      return row.planNo
    }, { fields: ["tenantId", "planNo"] }))

    const requestOrders = await Promise.all([0, 1].map((i) => prisma.salesOrder.create({ data: { tenantId: f.tenant.id, siteId: f.site.id, customerId: f.customer.id, orderNo: `REQ-SO-${runId}-${i}`, orderDate: new Date(), deliveryDate: new Date(), status: "CONFIRMED", items: { create: [{ itemId: f.fgItem.id, qty: 1 }] } }, include: { items: true } })))
    await runTwo("SalesOrder request ProductionPlan", async (sync) => {
      const order = requestOrders.pop()!
      return withUniqueBusinessNumberRetry(async (attempt) => {
        const prefix = `PP-REQ-${parts.yyyymmdd}`
        const planNo = await nextSimpleNo(prisma.productionPlan, f.tenant.id, "planNo", `${prefix}-`, 3)
        if (attempt === 0) await sync()
        const row = await prisma.productionPlan.create({ data: { tenantId: f.tenant.id, siteId: f.site.id, planNo, planType: "DAILY", startDate: new Date(), endDate: new Date(), status: "DRAFT", items: { create: [{ itemId: f.fgItem.id, plannedQty: 1, salesOrderItemId: order.items[0].id }] } } })
        return row.planNo
      }, { fields: ["tenantId", "planNo"] })
    })

    await runTwo("WorkOrder orderNo/manufacturingNo", (sync) => withUniqueBusinessNumberRetry(async (attempt) => {
      const orderNo = await nextSimpleNo(prisma.workOrder, f.tenant.id, "orderNo", `WO-${parts.year}-`, 3)
      const manufacturingNo = await generateCnsManufacturingNo(prisma, f.tenant.id, { lotNumberingType: "PREFIX_MONTH_SEQ", lotPrefix: f.fgItem.lotPrefix, manualLotPolicy: "DISABLED", itemType: "FINISHED" }, new Date(), attempt)
      if (attempt === 0) await sync()
      const row = await prisma.workOrder.create({ data: { tenantId: f.tenant.id, siteId: f.site.id, itemId: f.fgItem.id, bomId: f.bom.id, routingId: f.routing.id, orderNo, manufacturingNo, plannedQty: 1, status: "DRAFT", operations: { create: [{ routingOperationId: f.routingOperation.id, seq: 1, plannedQty: 1 }] } } })
      return `${row.orderNo}/${row.manufacturingNo}`
    }, { fields: [] }))

    await runTwo("PurchaseOrder", (sync) => withUniqueBusinessNumberRetry(async (attempt) => {
      const orderNo = await nextSimpleNo(prisma.purchaseOrder, f.tenant.id, "orderNo", `PO-${parts.year}-`, 3)
      if (attempt === 0) await sync()
      const row = await prisma.purchaseOrder.create({ data: { tenantId: f.tenant.id, siteId: f.site.id, supplierId: f.supplier.id, orderNo, orderDate: new Date(), expectedDate: new Date(), status: "ORDERED", items: { create: [{ itemId: f.rawItem.id, qty: 1, unitPrice: 1 }] } } })
      return row.orderNo
    }, { fields: ["tenantId", "orderNo"] }))

    const shipmentOrders = await Promise.all([0, 1].map((i) => prisma.salesOrder.create({ data: { tenantId: f.tenant.id, siteId: f.site.id, customerId: f.customer.id, orderNo: `SHIP-SO-${runId}-${i}`, orderDate: new Date(), deliveryDate: new Date(), status: "CONFIRMED", items: { create: [{ itemId: f.fgItem.id, qty: 1 }] } }, include: { items: true } })))
    await runTwo("ShipmentOrder", async (sync) => {
      const so = shipmentOrders.pop()!
      return withUniqueBusinessNumberRetry(async (attempt) => {
        const shipmentNo = await nextSimpleNo(prisma.shipmentOrder, f.tenant.id, "shipmentNo", `SH-${parts.year}-`, 3)
        if (attempt === 0) await sync()
        const row = await prisma.shipmentOrder.create({ data: { tenantId: f.tenant.id, siteId: f.site.id, salesOrderId: so.id, warehouseId: f.warehouse.id, shipmentNo, plannedDate: new Date(), status: "PLANNED", items: { create: [{ salesOrderItemId: so.items[0].id, itemId: f.fgItem.id, qty: 1 }] } } })
        return row.shipmentNo
      }, { fields: ["tenantId", "shipmentNo"] })
    })

    await runTwo("MaterialReturn", (sync) => withUniqueBusinessNumberRetry(async (attempt) => {
      const returnNo = await nextSimpleNo(prisma.materialReturn, f.tenant.id, "returnNo", `SR-${parts.year}-`, 3)
      if (attempt === 0) await sync()
      const row = await prisma.materialReturn.create({ data: { tenantId: f.tenant.id, siteId: f.site.id, supplierId: f.supplier.id, returnNo, createdById: f.profile.id } })
      return row.returnNo
    }, { fields: ["tenantId", "returnNo"] }))

    await runTwo("InventoryTransaction", (sync) => withUniqueBusinessNumberRetry(async (attempt) => {
      const txNo = await nextSimpleNo(prisma.inventoryTransaction, f.tenant.id, "txNo", `ADJ-${parts.yyyymmdd}-`, 4)
      if (attempt === 0) await sync()
      const row = await prisma.inventoryTransaction.create({ data: { tenantId: f.tenant.id, itemId: f.rawItem.id, toLocationId: f.warehouse.id, txNo, txType: "ADJUST", qty: 1, txAt: new Date() } })
      return row.txNo
    }, { fields: ["tenantId", "txNo"] }))

    await runTwo("Receiving InventoryTransaction", (sync) => withUniqueBusinessNumberRetry(async (attempt) => {
      const txNo = await nextSimpleNo(prisma.inventoryTransaction, f.tenant.id, "txNo", `RCV-${parts.yyyymmdd}-`, 4)
      if (attempt === 0) await sync()
      const po = await prisma.purchaseOrder.create({ data: { tenantId: f.tenant.id, siteId: f.site.id, supplierId: f.supplier.id, orderNo: `RCV-PO-${runId}-${Math.random()}`, orderDate: new Date(), expectedDate: new Date(), status: "ORDERED", items: { create: [{ itemId: f.rawItem.id, qty: 10, unitPrice: 1 }] } }, include: { items: true } })
      await prisma.receivingInspection.create({ data: { purchaseOrderItemId: po.items[0].id, receivedQty: 1, acceptedQty: 1, rejectedQty: 0, result: "PASS" } })
      const row = await prisma.inventoryTransaction.create({ data: { tenantId: f.tenant.id, itemId: f.rawItem.id, toLocationId: f.warehouse.id, txNo, txType: "RECEIPT", qty: 1, refType: "PURCHASE_ORDER", refId: po.id, txAt: new Date() } })
      return row.txNo
    }, { fields: ["tenantId", "txNo"] }))

    await runTwo("Outsourcing PurchaseOrder", (sync) => withUniqueBusinessNumberRetry(async (attempt) => {
      const now = new Date()
      const orderNo = `OS-${parts.yyyymmdd}-${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}-${attempt}`
      if (attempt === 0) await sync()
      const row = await prisma.purchaseOrder.create({ data: { tenantId: f.tenant.id, siteId: f.site.id, supplierId: f.supplier.id, orderNo, orderDate: new Date(), expectedDate: new Date(), status: "ORDERED", note: "[OUTSOURCING] F19" } })
      return row.orderNo
    }, { fields: ["tenantId", "orderNo"] }))

    const createReservedLot = async (label: string, item: any, context: any, poItemId: string) => {
      await runTwo(label, (sync) => withUniqueBusinessNumberRetry(async (attempt) => {
        const lotNo = await computeNextMaterialReceiptLotNo(prisma, f.tenant.id, context, new Date(), attempt)
        if (attempt === 0) await sync()
        await prisma.lotNumberReservation.create({ data: { tenantId: f.tenant.id, itemId: item.id, purchaseOrderId: f.poForLots.id, purchaseOrderItemId: poItemId, lotNo, status: "CONSUMED", reservedBy: f.profile.id, expiresAt: new Date(Date.now() + 60000), consumedAt: new Date() } })
        const row = await prisma.lot.create({ data: { tenantId: f.tenant.id, itemId: item.id, lotNo, status: "ACTIVE" } })
        return row.lotNo
      }, { fields: [] }))
    }

    const manualAllowedLot = await prisma.lot.create({ data: { tenantId: f.tenant.id, itemId: f.rawItem.id, lotNo: `MANUAL-${runId}`, status: "ACTIVE" } })
    ok(manualAllowedLot.lotNo === `MANUAL-${runId}`, "manual ALLOWED policy permits explicit manual LOT fixture")
    await assert.rejects(
      () => generateCnsMaterialReceiptLotNo(prisma, f.tenant.id, { lotNumberingType: "MANUAL", manualLotPolicy: "REQUIRED", itemType: "RAW_MATERIAL" }, new Date()),
      /직접 입력/,
      "manual REQUIRED policy refuses automatic LOT generation",
    )
    const disabledAutoLot = await generateCnsMaterialReceiptLotNo(prisma, f.tenant.id, { lotNumberingType: "PREFIX_MONTH_SEQ", lotPrefix: f.prefixItem.lotPrefix, manualLotPolicy: "DISABLED", itemType: "RAW_MATERIAL" }, new Date())
    ok(disabledAutoLot.startsWith(String(f.prefixItem.lotPrefix)), "manual DISABLED policy keeps automatic prefix LOT generation")

    await createReservedLot("LOT RAW_DATE_SEQ", f.rawItem, { lotNumberingType: "RAW_DATE_SEQ", manualLotPolicy: "ALLOWED", itemType: "RAW_MATERIAL" }, f.poItemRaw.id)
    await createReservedLot("LOT PREFIX_MONTH_SEQ", f.prefixItem, { lotNumberingType: "PREFIX_MONTH_SEQ", lotPrefix: f.prefixItem.lotPrefix, manualLotPolicy: "DISABLED", itemType: "RAW_MATERIAL" }, f.poItemPrefix.id)

    const tenantB = await prisma.tenant.create({ data: { code: `F19-${runId}-B`, name: "F19 tenant B" } })
    try {
      const sameNo = await nextSimpleNo(prisma.salesOrder, f.tenant.id, "orderNo", `SO-${parts.year}-`, 3)
      await prisma.site.create({ data: { tenantId: tenantB.id, code: `SB-${runId}`, name: "Tenant B", type: "FACTORY" } })
      const siteB = await prisma.site.findFirstOrThrow({ where: { tenantId: tenantB.id } })
      const customerB = await prisma.businessPartner.create({ data: { tenantId: tenantB.id, code: `CB-${runId}`, name: "Customer B", partnerType: "CUSTOMER" } })
      await prisma.salesOrder.create({ data: { tenantId: tenantB.id, siteId: siteB.id, customerId: customerB.id, orderNo: sameNo, orderDate: new Date(), deliveryDate: new Date(), status: "DRAFT" } })
      ok(true, "tenant isolation allows the same business number in a different tenant")
    } finally {
      await prisma.salesOrder.deleteMany({ where: { tenantId: tenantB.id } })
      await prisma.businessPartner.deleteMany({ where: { tenantId: tenantB.id } })
      await prisma.site.deleteMany({ where: { tenantId: tenantB.id } })
      await prisma.tenant.deleteMany({ where: { id: tenantB.id } })
    }

    ok(true, "actual DB concurrency fixture completed")
  } finally {
    await cleanup(runId)
    const leftovers = await prisma.tenant.count({ where: { code: { startsWith: `F19-${runId}` } } })
    ok(leftovers === 0, "F19 DB concurrency fixture cleanup removed test tenants")
  }
}

async function main() {
  const schema = read("prisma/schema.prisma")
  const commonCode = read("src/lib/actions/common-code.actions.ts")
  const referenceCheck = read("src/lib/actions/reference-check.server.ts")
  const location = read("src/lib/actions/location.actions.ts")
  const workCenter = read("src/lib/actions/work-center.actions.ts")
  const businessNumbering = read("src/lib/business-numbering.ts")
  const salesOrder = read("src/lib/actions/sales-order.actions.ts")
  const quotation = read("src/lib/actions/quotation.actions.ts")
  const productionPlan = read("src/lib/actions/production-plan.actions.ts")
  const workOrder = read("src/lib/actions/work-order.actions.ts")
  const purchaseOrder = read("src/lib/actions/purchase-order.actions.ts")
  const shipment = read("src/lib/actions/shipment.actions.ts")
  const materialReturn = read("src/lib/actions/material-return.actions.ts")
  const inventory = read("src/lib/actions/inventory.actions.ts")
  const receiving = read("src/lib/actions/receiving.actions.ts")
  const outsourcing = read("src/lib/actions/outsourcing.actions.ts")
  const lotGenerator = read("src/lib/lot-numbering/lot-number-generator.ts")

  ok(commonCode.includes('where: { tenantId }'), "CommonCode list is tenant scoped")
  ok(commonCode.includes("checkDowntimeReasonReferencesForBulk"), "CommonCode reuses downtime reference helper")
  ok(commonCode.includes("assertDowntimeReasonIdentityChangeAllowed"), "used DOWNTIME_REASON code/name rename is guarded")
  ok(functionBody(commonCode, "src/lib/actions/common-code.actions.ts", "deleteCommonCode").includes("assertDowntimeReasonDeleteAllowed"), "used DOWNTIME_REASON delete is guarded")
  ok(referenceCheck.includes("checkWorkCenterReferencesForBulk"), "WorkCenter reference helper exists")
  ok(referenceCheck.includes("routingOperation.count") && referenceCheck.includes("wipUnit.count") && referenceCheck.includes("wipMovement.count") && referenceCheck.includes("equipment.count"), "WorkCenter helper covers routing/equipment/WIP references")
  ok(functionBody(location, "src/lib/actions/location.actions.ts", "deleteLocation").includes("checkWarehouseReferencesForBulk"), "single Warehouse delete reuses bulk reference helper")
  ok(functionBody(workCenter, "src/lib/actions/work-center.actions.ts", "deleteWorkCenter").includes("checkWorkCenterReferencesForBulk"), "single WorkCenter delete reuses shared reference helper")
  ok(businessNumbering.includes("toKstDateKey"), "business numbering helper uses KST date key")
  ok(businessNumbering.includes("P2002"), "business numbering helper detects Prisma unique errors")
  ok(schema.includes("@@unique([tenantId, manufacturingNo])"), "WorkOrder manufacturingNo is tenant unique")
  ok(!lotGenerator.includes("take: 1000") && !lotGenerator.includes("take:1000"), "LOT/manufacturing helper no longer depends on take:1000")
  ok(!lotGenerator.includes("findMany"), "LOT/manufacturing helper no longer fetches all prefix rows")
  ok(lotGenerator.includes("MAX(CAST(SUBSTRING"), "LOT/manufacturing helper computes numeric suffix max in DB")
  ok(lotGenerator.includes("kstDateParts"), "LOT/manufacturing helper uses KST date parts")
  ok(functionBody(salesOrder, "src/lib/actions/sales-order.actions.ts", "createSalesOrder").includes("withUniqueBusinessNumberRetry"), "SalesOrder create retries unique orderNo collisions")
  ok(salesOrder.includes("generateSalesRequestPlanNo") && functionBody(salesOrder, "src/lib/actions/sales-order.actions.ts", "requestProductionFromSalesOrder").includes("withUniqueBusinessNumberRetry"), "SalesOrder production request retries planNo collisions")
  ok(quotation.includes("generateSalesOrderNo") && functionBody(quotation, "src/lib/actions/quotation.actions.ts", "convertToSalesOrder").includes("withUniqueBusinessNumberRetry"), "Quotation conversion reuses canonical SalesOrder generator with retry")
  ok(functionBody(productionPlan, "src/lib/actions/production-plan.actions.ts", "createPlan").includes("withUniqueBusinessNumberRetry"), "ProductionPlan create retries unique planNo collisions")
  const createWorkOrderBody = functionBody(workOrder, "src/lib/actions/work-order.actions.ts", "createWorkOrder")
  ok(createWorkOrderBody.includes("withUniqueBusinessNumberRetry"), "WorkOrder create retries orderNo/manufacturingNo collisions")
  ok(!createWorkOrderBody.includes("fields: []"), "WorkOrder create does not retry every transaction P2002")
  ok(createWorkOrderBody.includes('[["tenantId", "orderNo"], ["tenantId", "manufacturingNo"]]'), "WorkOrder create limits automatic retry targets to orderNo and manufacturingNo")
  ok(createWorkOrderBody.includes('[["tenantId", "orderNo"]]') && createWorkOrderBody.includes("이미 사용 중인 제조번호입니다."), "manual WorkOrder manufacturingNo duplicate is not auto-renumbered and returns a clear message")
  ok(functionBody(purchaseOrder, "src/lib/actions/purchase-order.actions.ts", "createPurchaseOrder").includes("withUniqueBusinessNumberRetry"), "PurchaseOrder create retries orderNo collisions")
  ok(functionBody(shipment, "src/lib/actions/shipment.actions.ts", "createShipment").includes("withUniqueBusinessNumberRetry"), "Shipment create retries shipmentNo collisions")
  ok(materialReturn.includes("BUSINESS_NUMBER_MAX_ATTEMPTS") && materialReturn.includes('isUniqueConstraintError(e, ["tenantId", "returnNo"])'), "MaterialReturn returnNo retry uses canonical unique detection")
  ok(inventory.includes("BUSINESS_NUMBER_MAX_ATTEMPTS") && inventory.includes('isUniqueConstraintError(error, ["tenantId", "txNo"])'), "InventoryTransaction txNo retry uses canonical unique detection")
  ok(receiving.includes("BUSINESS_NUMBER_MAX_ATTEMPTS") && receiving.includes('isUniqueConstraintError(error, ["tenantId", "txNo"])'), "Receiving txNo retry uses canonical unique detection")
  ok(functionBody(outsourcing, "src/lib/actions/outsourcing.actions.ts", "createOutsourcingOrder").includes("withUniqueBusinessNumberRetry"), "Outsourcing order create retries PurchaseOrder orderNo collisions")

  await runRetryTargetChecks()

  loadEnvConfig(root)
  ok(kstDateParts(new Date("2026-01-01T14:59:59.000Z")).dateKey === "2026-01-01", "KST boundary keeps UTC 14:59:59 on the same KST date")
  ok(kstDateParts(new Date("2026-01-01T15:00:00.000Z")).dateKey === "2026-01-02", "KST boundary rolls UTC 15:00:00 to the next KST date")

  const databaseUrl = process.env.DATABASE_URL || ""
  if (databaseUrl) {
    if (!databaseUrl.includes("zgjoiyqtfivywajygevj")) throw new Error("DATABASE_URL is not the Cheongun Supabase project")
    const duplicateManufacturingNos = await prisma.$queryRaw<Array<{ tenantId: string; manufacturingNo: string; count: number }>>`
      SELECT "tenantId", "manufacturingNo", COUNT(*)::int AS count
      FROM "WorkOrder"
      WHERE "manufacturingNo" IS NOT NULL AND "manufacturingNo" <> ''
      GROUP BY "tenantId", "manufacturingNo"
      HAVING COUNT(*) > 1
      LIMIT 1
    `
    ok(duplicateManufacturingNos.length === 0, "current DB has no non-empty WorkOrder manufacturingNo duplicates")
    await runDbConcurrencyChecks()
  } else {
    console.log("SKIP DATABASE_URL is not configured; source-level F19 checks completed")
  }
}

main().catch((error) => { console.error(error); process.exit(1) }).finally(() => prisma.$disconnect())





