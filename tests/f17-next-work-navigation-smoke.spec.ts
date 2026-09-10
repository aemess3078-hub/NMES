import { test, expect, Page } from "@playwright/test"

const BASE_URL = "http://localhost:3000"

async function setupAuth(page: Page) {
  await page.goto(BASE_URL)
  await page.getByRole("button", { name: /시스템모드/ }).click()
  await page.getByLabel("아이디").fill("admin")
  await page.getByLabel("비밀번호").fill("Admin@1234")
  await page.getByRole("button", { name: "로그인" }).click()
  await page.waitForURL(/\/app\/mes\/?$/, { timeout: 15000 })
  await page.waitForLoadState("networkidle", { timeout: 15000 })
}

async function assertPageLoads(page: Page, path: string, heading: string) {
  await page.goto(BASE_URL + path)
  await page.waitForLoadState("networkidle", { timeout: 20000 })

  const bodyText = await page.locator("body").innerText()
  expect(bodyText).not.toContain("An error occurred")
  expect(bodyText).not.toContain("Application error")
  await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: 10000 })
}

test.describe("F17 next-work navigation smoke", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page)
  })

  test("context URLs render without crashing", async ({ page }) => {
    const smokeId = "f17-smoke-invalid-id"
    await assertPageLoads(page, `/app/mes/production-plan?salesOrderId=${smokeId}`, "생산계획")
    await assertPageLoads(page, `/app/mes/work-orders?productionPlanId=${smokeId}&productionPlanItemId=${smokeId}`, "작업지시")
    await assertPageLoads(page, `/app/mes/material-issue?workOrderId=${smokeId}`, "자재출고")
    await assertPageLoads(page, `/app/mes/inspection?operationId=${smokeId}&workOrderId=${smokeId}`, "공정검사")
    await assertPageLoads(page, `/app/mes/finished-goods-receipt?workOrderId=${smokeId}`, "완제품 입고 관리")
    await assertPageLoads(page, `/app/mes/shipments?salesOrderId=${smokeId}`, "출하등록")
    await assertPageLoads(page, `/app/mes/traceability?lotId=${smokeId}`, "LOT 추적 조회")
    await assertPageLoads(page, `/app/mes/equipment-repair?equipmentId=${smokeId}`, "설비수리관리")
    await assertPageLoads(page, `/app/mes/equipment-check?equipmentId=${smokeId}`, "정기점검")
  })
})
