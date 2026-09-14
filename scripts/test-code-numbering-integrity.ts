import { readFileSync } from "fs"
import { join } from "path"
import assert from "assert"
import ts from "typescript"
import { loadEnvConfig } from "@next/env"
import { PrismaClient } from "@prisma/client"

const root = process.cwd()

function read(path: string) {
  return readFileSync(join(root, path), "utf8")
}

function ok(value: unknown, message: string) {
  assert.ok(value, message)
  console.log(`PASS ${message}`)
}

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
  ok(lotGenerator.includes("kstDateParts"), "LOT/manufacturing helper uses KST date parts")

  ok(functionBody(salesOrder, "src/lib/actions/sales-order.actions.ts", "createSalesOrder").includes("withUniqueBusinessNumberRetry"), "SalesOrder create retries unique orderNo collisions")
  ok(salesOrder.includes("generateSalesRequestPlanNo") && functionBody(salesOrder, "src/lib/actions/sales-order.actions.ts", "requestProductionFromSalesOrder").includes("withUniqueBusinessNumberRetry"), "SalesOrder production request retries planNo collisions")
  ok(quotation.includes("generateSalesOrderNo") && functionBody(quotation, "src/lib/actions/quotation.actions.ts", "convertToSalesOrder").includes("withUniqueBusinessNumberRetry"), "Quotation conversion reuses canonical SalesOrder generator with retry")
  ok(functionBody(productionPlan, "src/lib/actions/production-plan.actions.ts", "createPlan").includes("withUniqueBusinessNumberRetry"), "ProductionPlan create retries unique planNo collisions")
  ok(functionBody(workOrder, "src/lib/actions/work-order.actions.ts", "createWorkOrder").includes("withUniqueBusinessNumberRetry"), "WorkOrder create retries orderNo/manufacturingNo collisions")
  ok(functionBody(purchaseOrder, "src/lib/actions/purchase-order.actions.ts", "createPurchaseOrder").includes("withUniqueBusinessNumberRetry"), "PurchaseOrder create retries orderNo collisions")
  ok(functionBody(shipment, "src/lib/actions/shipment.actions.ts", "createShipment").includes("withUniqueBusinessNumberRetry"), "Shipment create retries shipmentNo collisions")
  ok(materialReturn.includes("BUSINESS_NUMBER_MAX_ATTEMPTS") && materialReturn.includes('isUniqueConstraintError(e, ["tenantId", "returnNo"])'), "MaterialReturn returnNo retry uses canonical unique detection")
  ok(inventory.includes("BUSINESS_NUMBER_MAX_ATTEMPTS") && inventory.includes('isUniqueConstraintError(error, ["tenantId", "txNo"])'), "InventoryTransaction txNo retry uses canonical unique detection")
  ok(receiving.includes("BUSINESS_NUMBER_MAX_ATTEMPTS") && receiving.includes('isUniqueConstraintError(error, ["tenantId", "txNo"])'), "Receiving txNo retry uses canonical unique detection")
  ok(functionBody(outsourcing, "src/lib/actions/outsourcing.actions.ts", "createOutsourcingOrder").includes("withUniqueBusinessNumberRetry"), "Outsourcing order create retries PurchaseOrder orderNo collisions")

  loadEnvConfig(root)
  const databaseUrl = process.env.DATABASE_URL || ""
  if (databaseUrl) {
    const prisma = new PrismaClient()
    try {
      const duplicateManufacturingNos = await prisma.$queryRaw<Array<{ tenantId: string; manufacturingNo: string; count: number }>>`
        SELECT "tenantId", "manufacturingNo", COUNT(*)::int AS count
        FROM "WorkOrder"
        WHERE "manufacturingNo" IS NOT NULL AND "manufacturingNo" <> ''
        GROUP BY "tenantId", "manufacturingNo"
        HAVING COUNT(*) > 1
        LIMIT 1
      `
      ok(duplicateManufacturingNos.length === 0, "current DB has no non-empty WorkOrder manufacturingNo duplicates before applying unique migration")
    } finally {
      await prisma.$disconnect()
    }
  } else {
    console.log("SKIP DATABASE_URL is not configured; source-level F19 checks completed")
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
