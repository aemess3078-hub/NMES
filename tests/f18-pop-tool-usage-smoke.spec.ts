import { test, expect } from "@playwright/test"
import { loadEnvConfig } from "@next/env"
import { PrismaClient } from "@prisma/client"

loadEnvConfig(process.cwd())
const base = process.env.F18_SMOKE_URL ?? "http://localhost:3018"
const prefix = `F18-SMOKE-${Date.now()}`

test("optional POP actual tool selection and A to B attribution", async ({ page }) => {
  test.setTimeout(180000)
  if (!process.env.DATABASE_URL?.includes("zgjoiyqtfivywajygevj")) throw new Error("Cheongun DB required")
  const db = new PrismaClient()
  let fixture: any
  try {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: "tenant-demo-001" } })
    fixture = await db.$transaction(async tx => {
      const site = await tx.site.create({ data: { tenantId: tenant.id, code: prefix, name: prefix } })
      const wc = await tx.workCenter.create({ data: { siteId: site.id, code: prefix, name: "F18 CNC", kind: "ASSEMBLY" } })
      const item = await tx.item.create({ data: { tenantId: tenant.id, code: prefix, name: prefix, itemType: "FINISHED" } })
      const bom = await tx.bOM.create({ data: { tenantId: tenant.id, itemId: item.id, version: "1", status: "ACTIVE" } })
      const raw = await tx.item.create({ data: { tenantId: tenant.id, code: `${prefix}-RAW`, name: prefix, itemType: "RAW_MATERIAL" } })
      await tx.bOMItem.create({ data: { bomId: bom.id, componentItemId: raw.id, seq: 1, qtyPer: 1 } })
      const routing = await tx.routing.create({ data: { tenantId: tenant.id, code: prefix, name: prefix, version: "1", status: "ACTIVE", scope: "COMMON" } })
      const ro = await tx.routingOperation.create({ data: { routingId: routing.id, seq: 1, operationCode: "CNC", name: "F18 CNC", workCenterId: wc.id, standardTime: 1 } })
      const machine = await tx.equipment.create({ data: { tenantId: tenant.id, siteId: site.id, workCenterId: wc.id, code: "MACHINE-01", name: "F18 1호기", equipmentType: "MACHINE" } })
      const tools = []
      for (const code of ["TOOL-A", "TOOL-B", "TOOL-C"]) {
        const tool = await tx.equipment.create({ data: { tenantId: tenant.id, siteId: site.id, workCenterId: wc.id, code, name: `F18 ${code}`, equipmentType: "TOOL", lifeLimit: 1000 } })
        tools.push(tool)
        if (code !== "TOOL-C") await tx.equipmentOperationMap.create({ data: { equipmentId: tool.id, routingOperationId: ro.id } })
      }
      const wo = await tx.workOrder.create({ data: { tenantId: tenant.id, siteId: site.id, itemId: item.id, bomId: bom.id, routingId: routing.id, orderNo: prefix, plannedQty: 100, status: "IN_PROGRESS" } })
      await tx.inventoryTransaction.create({ data: { tenantId: tenant.id, itemId: raw.id, txNo: prefix, txType: "ISSUE", qty: 100, refType: "WORK_ORDER", refId: wo.id } })
      const op = await tx.workOrderOperation.create({ data: { workOrderId: wo.id, routingOperationId: ro.id, seq: 1, plannedQty: 100, status: "IN_PROGRESS", startedAt: new Date() } })
      const assignment = await tx.workOrderOperationAssignment.create({ data: { tenantId: tenant.id, workOrderOperationId: op.id, equipmentId: machine.id, seq: 1, assignedQty: 100, status: "IN_PROGRESS", startedAt: new Date() } })
      await tx.wipUnit.create({ data: { tenantId: tenant.id, siteId: site.id, workOrderId: wo.id, workOrderOperationId: op.id, itemId: item.id, currentWorkCenterId: wc.id, qty: 100, status: "IN_PROCESS" } })
      await tx.workOrderMaterialLot.create({ data: { tenantId: tenant.id, workOrderId: wo.id, materialItemId: item.id, materialLotNo: prefix, qty: 100 } })
      return { site, wc, item, raw, bom, routing, ro, machine, tools, wo, op, assignment }
    }, { timeout: 20000 })
    await page.goto(base)
    await page.getByRole("button", { name: /시스템모드/ }).click()
    await page.getByLabel("아이디").fill("admin")
    await page.getByLabel("비밀번호").fill(process.env.F18_SMOKE_PASSWORD ?? "Admin@1234")
    await page.getByRole("button", { name: "로그인", exact: true }).click()
    await page.waitForURL(/\/app\/mes\/?$/, { timeout: 30000 })
    const path = `${base}/pop/production/${fixture.op.id}?assignmentId=${fixture.assignment.id}`
    await page.goto(path)
    await expect(page.getByRole("button", { name: "사용 안 함", exact: true })).toBeVisible()
    const a = page.getByRole("checkbox", { name: /TOOL-A/ })
    const b = page.getByRole("checkbox", { name: /TOOL-B/ })
    await expect(a).not.toBeChecked()
    await expect(b).not.toBeChecked()
    await expect(page.getByRole("checkbox", { name: /TOOL-C/ })).toHaveCount(0)
    const submit = async (qty: number, expectedCount: number) => {
      await page.locator('input[inputmode="decimal"], input[inputmode="numeric"]').first().fill(String(qty))
      await page.getByRole("button", { name: "실적 등록", exact: true }).click()
      await expect.poll(() => db.productionResult.count({ where: { workOrderOperationId: fixture.op.id } }), { timeout: 20000 }).toBe(expectedCount)
      await page.goto(path)
    }
    await submit(5, 1)
    expect(await db.equipmentUsageHistory.count({ where: { workOrderOperationId: fixture.op.id } })).toBe(0)
    expect((await db.equipment.findMany({ where: { id: { in: fixture.tools.map((t: any) => t.id) } } })).every(t => t.currentUsage === 0)).toBe(true)
    await a.check()
    await page.route("**/pop/production/**", async route => {
      const request = route.request()
      if (request.method() === "POST" && request.headers()["next-action"]) {
        await route.continue({ postData: request.postData()!.replaceAll(fixture.tools[0].id, fixture.tools[2].id) })
      } else await route.continue()
    })
    await page.locator('input[inputmode="decimal"], input[inputmode="numeric"]').first().fill("1")
    await page.getByRole("button", { name: "실적 등록", exact: true }).click()
    await expect(page.getByText("선택한 공구 중 현재 공정에서 사용할 수 없는 공구가 있습니다.", { exact: true })).toBeVisible()
    expect(await db.productionResult.count({ where: { workOrderOperationId: fixture.op.id } })).toBe(1)
    expect(await db.equipmentUsageHistory.count({ where: { workOrderOperationId: fixture.op.id } })).toBe(0)
    await page.unroute("**/pop/production/**")
    await submit(30, 2)
    await expect(a).not.toBeChecked()
    await b.check()
    await submit(20, 3)
    const results = await db.productionResult.findMany({ where: { workOrderOperationId: fixture.op.id }, orderBy: { endedAt: "asc" }, include: { equipmentUsageHistories: true } })
    expect(results.map(r => Number(r.goodQty))).toEqual([5, 30, 20])
    expect(results.map(r => r.equipmentUsageHistories.map(h => h.equipmentId))).toEqual([[], [fixture.tools[0].id], [fixture.tools[1].id]])
    for (const result of results) {
      expect(result.workOrderOperationAssignmentId).toBe(fixture.assignment.id)
      expect(result.operatorId).toBeTruthy()
      expect(result.startedAt).toBeTruthy()
      expect(result.endedAt).toBeTruthy()
    }
    const counts = await db.equipment.findMany({ where: { id: { in: fixture.tools.map((t: any) => t.id) } }, orderBy: { code: "asc" } })
    expect(counts.map(t => t.currentUsage)).toEqual([1, 1, 0])
    const otherPage = await page.context().newPage()
    await otherPage.goto(path)
    for (const target of [page, otherPage]) {
      await target.getByRole("checkbox", { name: /TOOL-A/ }).check()
      await target.locator('input[inputmode="decimal"], input[inputmode="numeric"]').first().fill("1")
    }
    await Promise.all([page, otherPage].map(target => target.getByRole("button", { name: "실적 등록", exact: true }).click()))
    await expect.poll(() => db.productionResult.count({ where: { workOrderOperationId: fixture.op.id } }), { timeout: 20000 }).toBe(5)
    expect((await db.equipment.findUniqueOrThrow({ where: { id: fixture.tools[0].id } })).currentUsage).toBe(3)
    expect(await db.equipmentUsageHistory.count({ where: { equipmentId: fixture.tools[0].id } })).toBe(3)
    await otherPage.close()
    await page.goto(path)
    await page.getByRole("button", { name: "사용 안 함", exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: "test-results/f18-pop-optional.png" })
    await page.goto(`${base}/app/mes/equipment-tools?workCenterId=${fixture.wc.id}`)
    await page.getByRole("row").filter({ hasText: "F18 TOOL-A" }).getByRole("button", { name: "상세", exact: true }).click()
    await expect(page.getByText(`${prefix} · F18 CNC · F18 1호기`, { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/POP 실적 30/)).toBeVisible()
    await page.goto(`${base}/app/pop/work-queue`)
    const card = page.locator("article").filter({ hasText: prefix })
    await card.getByRole("button", { name: "실적등록", exact: true }).click()
    await expect(card.getByRole("button", { name: "사용 안 함", exact: true })).toBeVisible()
    await expect(card.getByRole("checkbox", { name: /TOOL-A/ })).not.toBeChecked()
    console.log("Concurrent browser submissions: two results and two atomic usage increments; tool history and work queue UI verified")
    console.log("F18 browser + live DB: no selection 5; TOOL-A 30; TOOL-B 20; life [1,1,0]; exact result/equipment/operator/time verified")
  } finally {
    if (fixture) {
      await db.$transaction(async tx => {
        await tx.equipmentUsageHistory.deleteMany({ where: { workOrderOperationId: fixture.op.id } })
        await tx.productionResult.deleteMany({ where: { workOrderOperationId: fixture.op.id } })
        await tx.wipUnit.deleteMany({ where: { workOrderId: fixture.wo.id } })
        await tx.workOrderMaterialLot.deleteMany({ where: { workOrderId: fixture.wo.id } })
        await tx.workOrderOperationAssignment.deleteMany({ where: { workOrderOperationId: fixture.op.id } })
        await tx.workOrderOperation.delete({ where: { id: fixture.op.id } })
        await tx.workOrder.delete({ where: { id: fixture.wo.id } })
        await tx.equipmentOperationMap.deleteMany({ where: { routingOperationId: fixture.ro.id } })
        await tx.equipment.deleteMany({ where: { siteId: fixture.site.id } })
        await tx.routingOperation.delete({ where: { id: fixture.ro.id } })
        await tx.routing.delete({ where: { id: fixture.routing.id } })
        await tx.inventoryTransaction.deleteMany({ where: { tenantId: fixture.site.tenantId, txNo: prefix } })
        await tx.bOMItem.deleteMany({ where: { bomId: fixture.bom.id } })
        await tx.bOM.delete({ where: { id: fixture.bom.id } })
        await tx.item.delete({ where: { id: fixture.item.id } })
        await tx.item.delete({ where: { id: fixture.raw.id } })
        await tx.workCenter.delete({ where: { id: fixture.wc.id } })
        await tx.site.delete({ where: { id: fixture.site.id } })
      }, { timeout: 20000 })
      console.log("F18 smoke fixture cleanup complete")
    }
    await db.$disconnect()
  }
})
