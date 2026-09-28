import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { register } from "tsconfig-paths"
import { DocType, Prisma, type UserRole } from "@prisma/client"
import { prisma } from "../src/lib/db/prisma"
import type { CurrentUser } from "../src/lib/auth"

register({
  baseUrl: process.cwd(),
  paths: { "@/*": ["src/*"] },
})

const { checkItemReferencesForBulk } = require("../src/lib/actions/reference-check.server") as typeof import("../src/lib/actions/reference-check.server")
const { getWorkStandardsForOperationContext } = require("../src/lib/pop-work-standard.server") as typeof import("../src/lib/pop-work-standard.server")
const { getRoutingOperationReferences } = require("../src/lib/routing-references.server") as typeof import("../src/lib/routing-references.server")
const {
  assertWorkStandardDocumentDeleteAllowed,
  assertWorkStandardDocumentTypeChangeAllowed,
  createWorkStandardMappingForTenant,
  deleteWorkStandardMappingForTenant,
  updateWorkStandardMappingForTenant,
  validateWorkStandardMappingTargets,
} = require("../src/lib/work-standard-mapping.server") as typeof import("../src/lib/work-standard-mapping.server")

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

async function rejects(fn: () => Promise<unknown>, message: string, includes?: string) {
  try {
    await fn()
    assert.fail(`${message}: expected rejection`)
  } catch (e) {
    if (includes) assert.ok(e instanceof Error && e.message.includes(includes), `${message}: ${e instanceof Error ? e.message : String(e)}`)
    ok(true, message)
  }
}

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8")
}

const schema = read("prisma/schema.prisma")
const migrationSql = read("prisma/migrations/20260928120000_work_standard_operation_mapping/migration.sql")
const workStandardsActions = read("src/lib/actions/work-standards.actions.ts")
const workStandardServer = read("src/lib/work-standard-mapping.server.ts")
const popActions = read("src/lib/actions/pop.actions.ts")
const popWorkStandardServer = read("src/lib/pop-work-standard.server.ts")
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

ok(!/export\s+async\s+function\s+getWorkStandardsForOperationContext/.test(popActions), "B. POP SOP helper is not exported from the use-server POP action file")
ok(popActions.includes("@/lib/pop-work-standard.server"), "B. POP action imports the server-only production helper")
ok(popActions.includes("export async function getOperationDetail"), "B. public SOP read entry point remains getOperationDetail")
ok(popWorkStandardServer.includes("getWorkStandardsForOperationContext"), "B. production POP SOP query helper lives outside use-server actions")
ok(workStandardsActions.includes("requireResourcePermission(\"WORK_STANDARD\", \"READ\")"), "C. management read uses WORK_STANDARD READ")
ok(workStandardsActions.includes("requireResourcePermission(\"WORK_STANDARD\", \"UPDATE\")"), "C. mapping create/update/delete uses WORK_STANDARD UPDATE")
ok(workStandardsActions.includes("createWorkStandardMappingForTenant"), "C. server action uses production mapping mutation helper")
ok(workStandardServer.includes("validateWorkStandardMappingTargets"), "C. production mapping validation helper exists")
ok(workStandardServer.includes("validateRoutingForItemContext"), "C. mapping validation reuses shared routing policy helper")
ok(workStandardServer.includes("document.docType !== DocType.SOP"), "C. only SOP documents can be mapped")
ok(workStandardServer.includes("!document.fileUrl?.trim()"), "C. SOP mapping requires fileUrl")
ok(workStandardServer.includes("entityType: \"WorkStandardMapping\""), "C. mapping mutations are audited as WorkStandardMapping")
ok(workStandardServer.includes("WORK_STANDARD_MAPPING_MENU_NAME"), "C. mapping audit logs use 작업표준서관리 menu")
ok(popActions.includes("operation.workOrder.itemId") && popActions.includes("operation.routingOperationId"), "D. POP action resolves item and routing operation server-side")
ok(productionClient.includes("작업표준서"), "D. POP production screen renders work-standard section")
ok(productionClient.includes("표시할 작업표준서가 없습니다."), "D. POP empty state is non-blocking")
ok(productionClient.includes("standard.fileUrl"), "D. POP opens the mapped SOP file URL")
ok(workStandardsActions.includes("assertWorkStandardDocumentTypeChangeAllowed"), "E. docType protection uses production helper")
ok(workStandardsActions.includes("assertWorkStandardDocumentDeleteAllowed"), "E. document delete protection uses production helper")
ok(itemActions.includes("workStandardMapping"), "E. Item delete checks WorkStandardMapping references")
ok(referenceCheck.includes("작업표준서 매핑"), "E. bulk item delete checks WorkStandardMapping references")
ok(routingActions.includes("workStandardMappingCount"), "E. RoutingOperation destructive changes check WorkStandardMapping references")

const runId = `F21${Date.now().toString().slice(-8)}`
const tenantACode = `${runId}-A`
const tenantBCode = `${runId}-B`
let cleanupTenantIds: string[] = []

async function cleanup() {
  const tenants = await prisma.tenant.findMany({ where: { code: { in: [tenantACode, tenantBCode] } }, select: { id: true } })
  const tenantIds = tenants.map((tenant) => tenant.id)
  if (tenantIds.length === 0) return
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.workStandardMapping.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.workOrderOperation.deleteMany({ where: { workOrder: { tenantId: { in: tenantIds } } } })
  await prisma.workOrder.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.routingOperation.deleteMany({ where: { routing: { tenantId: { in: tenantIds } } } })
  await prisma.itemRouting.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.routing.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.workCenter.deleteMany({ where: { site: { tenantId: { in: tenantIds } } } })
  await prisma.site.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.document.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.item.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } })
  await prisma.profile.deleteMany({ where: { email: { contains: `${runId.toLowerCase()}@f21.test` } } })
}

async function assertCleanupZero() {
  const remaining = await prisma.tenant.count({ where: { code: { in: [tenantACode, tenantBCode] } } })
  ok(remaining === 0, "H. cleanup removed tenant A/B fixtures")
}

async function main() {
  await cleanup()
  try {
    const tenantA = await prisma.tenant.create({ data: { code: tenantACode, name: `F21 Tenant A ${runId}` } })
    const tenantB = await prisma.tenant.create({ data: { code: tenantBCode, name: `F21 Tenant B ${runId}` } })
    cleanupTenantIds = [tenantA.id, tenantB.id]
    ok(cleanupTenantIds.length === 2, "F. tenant A/B fixtures created")

    const [siteA, siteB] = await Promise.all([
      prisma.site.create({ data: { tenantId: tenantA.id, code: `SA-${runId}`, name: "F21 Site A", type: "FACTORY" } }),
      prisma.site.create({ data: { tenantId: tenantB.id, code: `SB-${runId}`, name: "F21 Site B", type: "FACTORY" } }),
    ])
    const [wcA, wcB] = await Promise.all([
      prisma.workCenter.create({ data: { siteId: siteA.id, code: `WCA-${runId}`, name: "F21 WC A" } }),
      prisma.workCenter.create({ data: { siteId: siteB.id, code: `WCB-${runId}`, name: "F21 WC B" } }),
    ])
    const [itemA, itemA2, itemB] = await Promise.all([
      prisma.item.create({ data: { tenantId: tenantA.id, code: `A1-${runId}`, name: "F21 Item A1", itemType: "FINISHED" } }),
      prisma.item.create({ data: { tenantId: tenantA.id, code: `A2-${runId}`, name: "F21 Item A2", itemType: "FINISHED" } }),
      prisma.item.create({ data: { tenantId: tenantB.id, code: `B1-${runId}`, name: "F21 Item B1", itemType: "FINISHED" } }),
    ])

    const docs = await Promise.all([
      prisma.document.create({ data: { tenantId: tenantA.id, code: `SOP-10-${runId}`, name: "F21 SOP 10", docType: "SOP", fileUrl: "https://example.com/10.pdf" } }),
      prisma.document.create({ data: { tenantId: tenantA.id, code: `SOP-20-${runId}`, name: "F21 SOP 20", docType: "SOP", fileUrl: "https://example.com/20.pdf" } }),
      prisma.document.create({ data: { tenantId: tenantA.id, code: `SOP-A2-${runId}`, name: "F21 SOP A2", docType: "SOP", fileUrl: "https://example.com/a2.pdf" } }),
      prisma.document.create({ data: { tenantId: tenantA.id, code: `SOP-INACTIVE-${runId}`, name: "F21 SOP Inactive", docType: "SOP", fileUrl: "https://example.com/inactive.pdf" } }),
      prisma.document.create({ data: { tenantId: tenantA.id, code: `DRAW-${runId}`, name: "F21 Drawing", docType: "DRAWING", fileUrl: "https://example.com/drawing.pdf" } }),
      prisma.document.create({ data: { tenantId: tenantA.id, code: `SPEC-${runId}`, name: "F21 Spec", docType: "SPEC", fileUrl: "https://example.com/spec.pdf" } }),
      prisma.document.create({ data: { tenantId: tenantA.id, code: `SOP-NOFILE-${runId}`, name: "F21 SOP No File", docType: "SOP", fileUrl: null } }),
      prisma.document.create({ data: { tenantId: tenantB.id, code: `SOP-B-${runId}`, name: "F21 SOP B", docType: "SOP", fileUrl: "https://example.com/b.pdf" } }),
      prisma.document.create({ data: { tenantId: tenantA.id, code: `SOP-AUDIT-${runId}`, name: "F21 SOP Audit", docType: "SOP", fileUrl: "https://example.com/audit.pdf" } }),
    ])
    const [sop10, sop20, sopA2, sopInactive, drawingA, specA, sopNoFile, sopB, sopAudit] = docs

    const [routingA, routingB, itemSpecificNoLink] = await Promise.all([
      prisma.routing.create({ data: { tenantId: tenantA.id, code: `RTA-${runId}`, name: "F21 Routing A", version: "1", status: "ACTIVE", scope: "COMMON" } }),
      prisma.routing.create({ data: { tenantId: tenantB.id, code: `RTB-${runId}`, name: "F21 Routing B", version: "1", status: "ACTIVE", scope: "COMMON" } }),
      prisma.routing.create({ data: { tenantId: tenantA.id, code: `RTS-${runId}`, name: "F21 Specific No Link", version: "1", status: "ACTIVE", scope: "ITEM_SPECIFIC" } }),
    ])
    const [opA1, opA2, opB1, opSpecificNoLink] = await Promise.all([
      prisma.routingOperation.create({ data: { routingId: routingA.id, workCenterId: wcA.id, seq: 10, operationCode: "OP10", name: "Cut" } }),
      prisma.routingOperation.create({ data: { routingId: routingA.id, workCenterId: wcA.id, seq: 20, operationCode: "OP20", name: "Pack" } }),
      prisma.routingOperation.create({ data: { routingId: routingB.id, workCenterId: wcB.id, seq: 10, operationCode: "OPB10", name: "Tenant B Cut" } }),
      prisma.routingOperation.create({ data: { routingId: itemSpecificNoLink.id, workCenterId: wcA.id, seq: 10, operationCode: "OPS10", name: "Specific" } }),
    ])

    const profile = await prisma.profile.create({ data: { email: `${runId.toLowerCase()}@f21.test`, name: "F21 Test Actor" } })

    const actor: CurrentUser = {
      id: profile.id,
      profileId: profile.id,
      loginId: `f21-${runId.toLowerCase()}`,
      email: `${runId.toLowerCase()}@f21.test`,
      name: "F21 Test Actor",
      tenantId: tenantA.id,
      role: "OWNER" as UserRole,
      isActive: true,
      mustChangePw: false,
    }

    await validateWorkStandardMappingTargets(prisma, { tenantId: tenantA.id, documentId: sop10.id, itemId: itemA.id, routingOperationId: opA1.id })
    ok(true, "G. validation allows tenant A SOP + tenant A item + tenant A COMMON operation")
    await rejects(() => validateWorkStandardMappingTargets(prisma, { tenantId: tenantA.id, documentId: sop10.id, itemId: itemB.id, routingOperationId: opA1.id }), "G. validation blocks tenant B item under tenant A")
    await rejects(() => validateWorkStandardMappingTargets(prisma, { tenantId: tenantA.id, documentId: sop10.id, itemId: itemA.id, routingOperationId: opB1.id }), "G. validation blocks tenant B routing operation under tenant A")
    await rejects(() => validateWorkStandardMappingTargets(prisma, { tenantId: tenantA.id, documentId: sopB.id, itemId: itemA.id, routingOperationId: opA1.id }), "G. validation blocks tenant B SOP under tenant A")
    await rejects(() => validateWorkStandardMappingTargets(prisma, { tenantId: tenantA.id, documentId: drawingA.id, itemId: itemA.id, routingOperationId: opA1.id }), "G. validation blocks DRAWING document")
    await rejects(() => validateWorkStandardMappingTargets(prisma, { tenantId: tenantA.id, documentId: specA.id, itemId: itemA.id, routingOperationId: opA1.id }), "G. validation blocks SPEC document")
    await rejects(() => validateWorkStandardMappingTargets(prisma, { tenantId: tenantA.id, documentId: sopNoFile.id, itemId: itemA.id, routingOperationId: opA1.id }), "G. validation blocks SOP without fileUrl")
    await rejects(() => validateWorkStandardMappingTargets(prisma, { tenantId: tenantA.id, documentId: sop10.id, itemId: itemA.id, routingOperationId: opSpecificNoLink.id }), "G. validation blocks ITEM_SPECIFIC routing without ItemRouting")

    await createWorkStandardMappingForTenant(prisma, { tenantId: tenantA.id, actor, documentId: sop20.id, itemId: itemA.id, routingOperationId: opA1.id, displayOrder: 20 })
    await createWorkStandardMappingForTenant(prisma, { tenantId: tenantA.id, actor, documentId: sop10.id, itemId: itemA.id, routingOperationId: opA1.id, displayOrder: 10 })
    await createWorkStandardMappingForTenant(prisma, { tenantId: tenantA.id, actor, documentId: sopA2.id, itemId: itemA2.id, routingOperationId: opA1.id, displayOrder: 1 })
    await createWorkStandardMappingForTenant(prisma, { tenantId: tenantA.id, actor, documentId: sopInactive.id, itemId: itemA.id, routingOperationId: opA1.id, displayOrder: 5 })
    await prisma.workStandardMapping.updateMany({ where: { tenantId: tenantA.id, documentId: sopInactive.id }, data: { isActive: false } })
    await createWorkStandardMappingForTenant(prisma, { tenantId: tenantA.id, actor, documentId: sop10.id, itemId: itemA.id, routingOperationId: opA2.id, displayOrder: 1 })
    await createWorkStandardMappingForTenant(prisma, { tenantId: tenantB.id, actor: { ...actor, tenantId: tenantB.id }, documentId: sopB.id, itemId: itemB.id, routingOperationId: opB1.id, displayOrder: 1 })

    await prisma.workStandardMapping.create({ data: { tenantId: tenantA.id, documentId: drawingA.id, itemId: itemA.id, routingOperationId: opA1.id, displayOrder: 1 } })
    await prisma.workStandardMapping.create({ data: { tenantId: tenantA.id, documentId: sopNoFile.id, itemId: itemA.id, routingOperationId: opA1.id, displayOrder: 2 } })

    await rejects(
      () => createWorkStandardMappingForTenant(prisma, { tenantId: tenantA.id, actor, documentId: sop10.id, itemId: itemA.id, routingOperationId: opA1.id }),
      "I. duplicate mapping is rejected with production duplicate policy",
      "이미 같은 SOP/품목/공정 매핑"
    )

    const exact = await getWorkStandardsForOperationContext(prisma, { tenantId: tenantA.id, itemId: itemA.id, routingOperationId: opA1.id })
    ok(exact.map((row) => row.code).join(",") === `${sop10.code},${sop20.code}`, "J. exact POP lookup returns only Item A + OP1 SOPs in displayOrder order")
    ok(!exact.some((row) => row.code === sopInactive.code), "J. inactive mappings are excluded from POP")
    ok(!exact.some((row) => row.code === drawingA.code || row.code === sopNoFile.code), "J. non-SOP and SOP without fileUrl are excluded from POP")
    const op2 = await getWorkStandardsForOperationContext(prisma, { tenantId: tenantA.id, itemId: itemA.id, routingOperationId: opA2.id })
    ok(op2.length === 1 && op2[0].code === sop10.code, "J. Item A + OP2 mapping is separate from Item A + OP1")
    const item2 = await getWorkStandardsForOperationContext(prisma, { tenantId: tenantA.id, itemId: itemA2.id, routingOperationId: opA1.id })
    ok(item2.length === 1 && item2[0].code === sopA2.code, "J. Item A2 + OP1 mapping is separate from Item A + OP1")
    const tenantBLookupFromA = await getWorkStandardsForOperationContext(prisma, { tenantId: tenantA.id, itemId: itemB.id, routingOperationId: opB1.id })
    ok(tenantBLookupFromA.length === 0, "J. tenant B mapping is excluded from tenant A lookup")

    await rejects(() => assertWorkStandardDocumentDeleteAllowed(prisma, { tenantId: tenantA.id, documentId: sop10.id }), "K. mapped Document delete is protected")
    const itemRefs = await checkItemReferencesForBulk(itemA.id, tenantA.id)
    ok(!itemRefs.canDelete && itemRefs.reasons.some((reason) => reason.includes("작업표준서 매핑")), "K. mapped Item reference check blocks delete")
    const routingRefs = await getRoutingOperationReferences(prisma, [opA1.id])
    ok(routingRefs.workStandardMappingCount > 0, "K. mapped RoutingOperation reference count includes WorkStandardMapping")
    await rejects(() => assertWorkStandardDocumentTypeChangeAllowed(prisma, { tenantId: tenantA.id, documentId: sop10.id, nextDocType: DocType.DRAWING }), "L. mapped SOP cannot change docType to DRAWING")

    const auditMapping = await createWorkStandardMappingForTenant(prisma, { tenantId: tenantA.id, actor, documentId: sopAudit.id, itemId: itemA2.id, routingOperationId: opA2.id, displayOrder: 30 })
    await updateWorkStandardMappingForTenant(prisma, { tenantId: tenantA.id, actor, id: auditMapping.id, isActive: false, displayOrder: 31 })
    await deleteWorkStandardMappingForTenant(prisma, { tenantId: tenantA.id, actor, id: auditMapping.id })
    const auditRows = await prisma.auditLog.findMany({
      where: { tenantId: tenantA.id, entityType: "WorkStandardMapping", entityId: auditMapping.id, menuName: "작업표준서관리" },
      select: { action: true, beforeData: true, afterData: true },
      orderBy: { actedAt: "asc" },
    })
    ok(auditRows.map((row) => row.action).join(",") === "CREATE,UPDATE,DELETE", "M. AuditLog CREATE/UPDATE/DELETE rows are written for mapping helper")
    ok(auditRows.every((row) => row.beforeData !== null || row.afterData !== null), "M. AuditLog rows include meaningful before/after payloads")
  } finally {
    await cleanup()
    await assertCleanupZero()
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
