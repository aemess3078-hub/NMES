import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { register } from "tsconfig-paths"
import { Prisma } from "@prisma/client"
import { prisma } from "../src/lib/db/prisma"

register({
  baseUrl: process.cwd(),
  paths: { "@/*": ["src/*"] },
})

const { getWorkStandardsForOperationContext } = require("../src/lib/actions/pop.actions") as typeof import("../src/lib/actions/pop.actions")

const CHEONGUN_REF = "zgjoiyqtfivywajygevj"
const CNS_REF = "rkglajpajtuavmptidur"
const databaseUrl = process.env.DATABASE_URL ?? ""

if (!databaseUrl.includes(CHEONGUN_REF)) {
  throw new Error(`F21 SOP POP integrity test must run only against Cheongun Supabase (${CHEONGUN_REF}).`)
}
if (databaseUrl.includes(CNS_REF)) {
  throw new Error(`F21 SOP POP integrity test refused CNS Supabase (${CNS_REF}).`)
}

let passed = 0
function ok(value: unknown, message: string) {
  assert.ok(value, message)
  passed += 1
  console.log(`PASS ${message}`)
}

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8")
}

const schema = read("prisma/schema.prisma")
const migrationSql = read("prisma/migrations/20260928120000_work_standard_operation_mapping/migration.sql")
const workStandardsActions = read("src/lib/actions/work-standards.actions.ts")
const popActions = read("src/lib/actions/pop.actions.ts")
const productionClient = read("src/app/pop/production/[operationId]/production-client.tsx")
const routingActions = read("src/lib/actions/routing.actions.ts")
const itemActions = read("src/lib/actions/item.actions.ts")
const referenceCheck = read("src/lib/actions/reference-check.server.ts")

ok(schema.includes("model WorkStandardMapping"), "A. Prisma schema defines WorkStandardMapping")
ok(schema.includes("@@unique([tenantId, documentId, itemId, routingOperationId])"), "A. schema enforces unique tenant/document/item/operation mapping")
ok(schema.includes("@@index([tenantId, itemId, routingOperationId, isActive])"), "A. schema indexes POP lookup shape")
ok(migrationSql.includes("CREATE TABLE \"WorkStandardMapping\""), "A. migration creates only the explicit mapping table")
ok(migrationSql.includes("FOREIGN KEY (\"documentId\") REFERENCES \"Document\""), "A. migration adds FK to Document")
ok(migrationSql.includes("FOREIGN KEY (\"itemId\") REFERENCES \"Item\""), "A. migration adds FK to Item")
ok(migrationSql.includes("FOREIGN KEY (\"routingOperationId\") REFERENCES \"RoutingOperation\""), "A. migration adds FK to RoutingOperation")

ok(workStandardsActions.includes("requireResourcePermission(\"WORK_STANDARD\", \"READ\")"), "B. management read uses WORK_STANDARD READ")
ok(workStandardsActions.includes("requireResourcePermission(\"WORK_STANDARD\", \"UPDATE\")"), "B. mapping create/update/delete uses WORK_STANDARD UPDATE")
ok(workStandardsActions.includes("validateRoutingForItem"), "B. mapping validation reuses Item/Routing policy")
ok(workStandardsActions.includes("document.docType !== DocType.SOP"), "B. only SOP documents can be mapped")
ok(workStandardsActions.includes("!document.fileUrl?.trim()"), "B. SOP mapping requires fileUrl")
ok(workStandardsActions.includes("entityType: \"WorkStandardMapping\""), "B. mapping mutations are audited as WorkStandardMapping")
ok(workStandardsActions.includes("menuName: MENU_NAME"), "B. mapping audit logs use 작업표준서관리 menu")

ok(popActions.includes("getWorkStandardsForOperationContext"), "C. POP query has dedicated work-standard helper")
ok(/document:\s*\{[\s\S]*docType:\s*"SOP"/.test(popActions), "C. POP helper filters SOP documents")
ok(popActions.includes("fileUrl: { not: null }"), "C. POP helper filters documents with fileUrl")
ok(productionClient.includes("작업표준서"), "C. POP production screen renders work-standard section")
ok(productionClient.includes("표시할 작업표준서가 없습니다."), "C. POP empty state is non-blocking")
ok(productionClient.includes("standard.fileUrl"), "C. POP opens the mapped SOP file URL")

ok(workStandardsActions.includes("POP 작업표준서 매핑이 있는 문서는 SOP 외 유형으로 변경할 수 없습니다."), "D. docType SOP→other is protected while mapped")
ok(workStandardsActions.includes("POP 작업표준서 매핑이 ${owned._count.workStandardMappings}건"), "D. mapped Document delete is protected")
ok(itemActions.includes("workStandardMapping"), "D. Item delete checks WorkStandardMapping references")
ok(referenceCheck.includes("작업표준서 매핑"), "D. bulk item delete checks WorkStandardMapping references")
ok(routingActions.includes("workStandardMappingCount"), "D. RoutingOperation destructive changes check WorkStandardMapping references")

const runId = `F21${Date.now().toString().slice(-8)}`

async function cleanup() {
  await prisma.workStandardMapping.deleteMany({ where: { tenant: { code: runId } } })
  await prisma.workOrderOperation.deleteMany({ where: { workOrder: { tenant: { code: runId } } } })
  await prisma.workOrder.deleteMany({ where: { tenant: { code: runId } } })
  await prisma.routingOperation.deleteMany({ where: { routing: { tenant: { code: runId } } } })
  await prisma.itemRouting.deleteMany({ where: { tenant: { code: runId } } })
  await prisma.routing.deleteMany({ where: { tenant: { code: runId } } })
  await prisma.workCenter.deleteMany({ where: { site: { tenant: { code: runId } } } })
  await prisma.site.deleteMany({ where: { tenant: { code: runId } } })
  await prisma.document.deleteMany({ where: { tenant: { code: runId } } })
  await prisma.item.deleteMany({ where: { tenant: { code: runId } } })
  await prisma.tenant.deleteMany({ where: { code: runId } })
}

async function expectPrismaUnique(fn: () => Promise<unknown>, message: string) {
  try {
    await fn()
    assert.fail(`${message}: expected P2002`)
  } catch (e) {
    ok(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002", message)
  }
}

async function main() {
  await cleanup()
  try {
    const tenant = await prisma.tenant.create({ data: { code: runId, name: `F21 ${runId}` } })
    const site = await prisma.site.create({ data: { tenantId: tenant.id, code: `S-${runId}`, name: "F21 Site", type: "FACTORY" } })
    const workCenter = await prisma.workCenter.create({ data: { siteId: site.id, code: `WC-${runId}`, name: "F21 WC" } })
    const item = await prisma.item.create({ data: { tenantId: tenant.id, code: `ITEM-${runId}`, name: "F21 Item", itemType: "FINISHED" } })
    const otherItem = await prisma.item.create({ data: { tenantId: tenant.id, code: `OTHER-${runId}`, name: "F21 Other Item", itemType: "FINISHED" } })
    const sopA = await prisma.document.create({ data: { tenantId: tenant.id, code: `SOP-A-${runId}`, name: "F21 SOP A", docType: "SOP", fileUrl: "https://example.com/a.pdf" } })
    const sopB = await prisma.document.create({ data: { tenantId: tenant.id, code: `SOP-B-${runId}`, name: "F21 SOP B", docType: "SOP", fileUrl: "https://example.com/b.pdf" } })
    const sopNoFile = await prisma.document.create({ data: { tenantId: tenant.id, code: `SOP-NOFILE-${runId}`, name: "F21 SOP No File", docType: "SOP", fileUrl: null } })
    const drawing = await prisma.document.create({ data: { tenantId: tenant.id, code: `DWG-${runId}`, name: "F21 Drawing", docType: "DRAWING", fileUrl: "https://example.com/drawing.pdf" } })
    const routing = await prisma.routing.create({ data: { tenantId: tenant.id, code: `RT-${runId}`, name: "F21 Routing", version: "1", status: "ACTIVE", scope: "COMMON" } })
    const operation = await prisma.routingOperation.create({ data: { routingId: routing.id, workCenterId: workCenter.id, seq: 10, operationCode: "OP10", name: "Cut" } })
    const operation2 = await prisma.routingOperation.create({ data: { routingId: routing.id, workCenterId: workCenter.id, seq: 20, operationCode: "OP20", name: "Pack" } })

    const active = await prisma.workStandardMapping.create({ data: { tenantId: tenant.id, documentId: sopB.id, itemId: item.id, routingOperationId: operation.id, displayOrder: 20 } })
    await prisma.workStandardMapping.create({ data: { tenantId: tenant.id, documentId: sopA.id, itemId: item.id, routingOperationId: operation.id, displayOrder: 10 } })
    await prisma.workStandardMapping.create({ data: { tenantId: tenant.id, documentId: sopNoFile.id, itemId: item.id, routingOperationId: operation.id, displayOrder: 5 } })
    await prisma.workStandardMapping.create({ data: { tenantId: tenant.id, documentId: drawing.id, itemId: item.id, routingOperationId: operation.id, displayOrder: 1 } })
    await prisma.workStandardMapping.create({ data: { tenantId: tenant.id, documentId: sopA.id, itemId: otherItem.id, routingOperationId: operation.id, displayOrder: 1 } })
    await prisma.workStandardMapping.create({ data: { tenantId: tenant.id, documentId: sopA.id, itemId: item.id, routingOperationId: operation2.id, displayOrder: 1 } })

    await expectPrismaUnique(
      () => prisma.workStandardMapping.create({ data: { tenantId: tenant.id, documentId: sopB.id, itemId: item.id, routingOperationId: operation.id } }),
      "E. duplicate tenant/document/item/operation mapping is rejected"
    )

    const standards = await getWorkStandardsForOperationContext({
      tenantId: tenant.id,
      itemId: item.id,
      routingOperationId: operation.id,
    })
    ok(standards.length === 2, "F. POP helper returns only active SOP mappings with fileUrl for the exact item/operation")
    ok(standards[0].code === sopA.code && standards[1].code === sopB.code, "G. POP helper orders by displayOrder then document code/name")
    ok(standards.every((s) => s.fileUrl.includes("example.com") && s.mappingId && s.documentId), "H. POP DTO includes mappingId, documentId, code, name, fileUrl, displayOrder")

    await prisma.workStandardMapping.update({ where: { id: active.id }, data: { isActive: false } })
    const afterInactive = await getWorkStandardsForOperationContext({ tenantId: tenant.id, itemId: item.id, routingOperationId: operation.id })
    ok(afterInactive.map((s) => s.code).join(",") === sopA.code, "I. inactive mappings are excluded from POP")

    const wrongItem = await getWorkStandardsForOperationContext({ tenantId: tenant.id, itemId: otherItem.id, routingOperationId: operation.id })
    ok(wrongItem.length === 1 && wrongItem[0].code === sopA.code, "J. POP lookup is scoped to the resolved work-order item")

    const wrongOperation = await getWorkStandardsForOperationContext({ tenantId: tenant.id, itemId: item.id, routingOperationId: operation2.id })
    ok(wrongOperation.length === 1 && wrongOperation[0].code === sopA.code, "K. POP lookup is scoped to the resolved routing operation")
  } finally {
    await cleanup()
    await prisma.$disconnect()
  }

  console.log(`\n${passed} F21 SOP POP integrity checks passed.`)
}

main().catch(async (error) => {
  console.error(error)
  await cleanup().catch(() => {})
  await prisma.$disconnect().catch(() => {})
  process.exitCode = 1
})

