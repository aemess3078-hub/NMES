import * as fs from "node:fs"
import { join } from "node:path"
import { register } from "tsconfig-paths"
import { chromium, expect } from "@playwright/test"
import { PartnerType, ProjectOrderStatus, ProjectStageStatus, SiteType } from "@prisma/client"

register({ baseUrl: process.cwd(), paths: { "@/*": ["src/*"] } })

function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = join(process.cwd(), file)
    if (!fs.existsSync(path)) continue
    for (const raw of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith("#")) continue
      const idx = line.indexOf("=")
      if (idx <= 0) continue
      const key = line.slice(0, idx).trim()
      if (process.env[key]) continue
      let value = line.slice(idx + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
      process.env[key] = value
    }
  }
}

loadLocalEnv()
const { prisma } = require("../src/lib/db/prisma") as typeof import("../src/lib/db/prisma")
const { hashPassword } = require("../src/lib/password") as typeof import("../src/lib/password")

const BASE_URL = process.env.F23_SMOKE_BASE_URL ?? "http://localhost:3000"
const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID ?? "tenant-demo-001"
const DEFAULT_CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const BROWSER_EXECUTABLE = process.env.F23_SMOKE_BROWSER ?? (fs.existsSync(DEFAULT_CHROME_PATH) ? DEFAULT_CHROME_PATH : undefined)
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
const prefix = `F23SMOKE-${suffix}`
const password = `F23Smoke!${suffix.slice(-5)}1`
const loginId = `f23smoke-${suffix}`.toLowerCase()

const ids: Record<string, string[]> = {
  projectStage: [],
  projectOrder: [],
  businessPartner: [],
  userCredential: [],
  tenantUser: [],
  profile: [],
}
let createdSiteId: string | null = null

async function cleanup() {
  await prisma.loginHistory.deleteMany({ where: { loginId } })
  await prisma.projectStage.deleteMany({ where: { id: { in: ids.projectStage } } })
  await prisma.projectOrder.deleteMany({ where: { id: { in: ids.projectOrder } } })
  await prisma.businessPartner.deleteMany({ where: { id: { in: ids.businessPartner } } })
  await prisma.userCredential.deleteMany({ where: { id: { in: ids.userCredential } } })
  await prisma.tenantUser.deleteMany({ where: { id: { in: ids.tenantUser } } })
  await prisma.profile.deleteMany({ where: { id: { in: ids.profile } } })
  if (createdSiteId) await prisma.site.deleteMany({ where: { id: createdSiteId } })
}

async function createFixture() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: DEFAULT_TENANT_ID } })
  const existingSite = await prisma.site.findFirst({ where: { tenantId: tenant.id } })
  const site = existingSite ?? await prisma.site.create({ data: { tenantId: tenant.id, code: `${prefix}-SITE`, name: "F23 Smoke Site", type: SiteType.FACTORY } })
  if (!existingSite) createdSiteId = site.id

  const profile = await prisma.profile.create({ data: { email: `${loginId}@example.invalid`, name: "F23 Smoke Owner" } })
  ids.profile.push(profile.id)
  const tenantUser = await prisma.tenantUser.create({ data: { tenantId: tenant.id, profileId: profile.id, siteId: site.id, role: "OWNER" } })
  ids.tenantUser.push(tenantUser.id)
  const credential = await prisma.userCredential.create({ data: { tenantId: tenant.id, profileId: profile.id, loginId, passwordHash: await hashPassword(password), mustChangePw: false } })
  ids.userCredential.push(credential.id)

  const customer = await prisma.businessPartner.create({ data: { tenantId: tenant.id, code: `${prefix}-CUST`, name: "F23 Smoke Customer", partnerType: PartnerType.CUSTOMER } })
  ids.businessPartner.push(customer.id)

  const projectOrder = await prisma.projectOrder.create({
    data: {
      tenantId: tenant.id,
      siteId: site.id,
      code: `${prefix}-PROJECT`,
      name: "F23 Smoke Project",
      customerId: customer.id,
      ownerId: profile.id,
      status: ProjectOrderStatus.IN_PROGRESS,
      plannedStartDate: new Date("2026-09-20T00:00:00+09:00"),
      dueDate: new Date("2026-09-30T00:00:00+09:00"),
      stages: {
        create: [
          { tenantId: tenant.id, seq: 10, name: "Design", status: ProjectStageStatus.COMPLETED, plannedStartDate: new Date("2026-09-20T00:00:00+09:00"), dueDate: new Date("2026-09-22T00:00:00+09:00"), completedAt: new Date("2026-09-22T00:00:00+09:00") },
          { tenantId: tenant.id, seq: 20, name: "Build", status: ProjectStageStatus.IN_PROGRESS, plannedStartDate: new Date("2026-09-23T00:00:00+09:00"), dueDate: new Date("2026-09-28T00:00:00+09:00"), startedAt: new Date("2026-09-23T00:00:00+09:00") },
          { tenantId: tenant.id, seq: 30, name: "Ship", status: ProjectStageStatus.PENDING, plannedStartDate: new Date("2026-09-29T00:00:00+09:00"), dueDate: new Date("2026-09-30T00:00:00+09:00") },
        ],
      },
    },
    include: { stages: true },
  })
  ids.projectOrder.push(projectOrder.id)
  ids.projectStage.push(...projectOrder.stages.map((stage) => stage.id))

  return { projectOrder }
}

async function main() {
  const fixture = await createFixture()
  const browser = await chromium.launch({ headless: true, executablePath: BROWSER_EXECUTABLE })
  const page = await browser.newPage()

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" })
    await page.getByRole("button", { name: /시스템모드/ }).click()
    await page.fill("#loginId", loginId)
    await page.fill("#password", password)
    await page.getByRole("button", { name: /로그인/ }).click()
    await page.waitForURL(/\/app/, { timeout: 15000 })

    await page.goto(`${BASE_URL}/app/mes/project-progress`, { waitUntil: "networkidle" })
    await expect(page.getByText("프로젝트 오더별 단계 완료율과 납기를 관리합니다")).toBeVisible()
    await expect(page.getByRole("columnheader", { name: "단계 완료율" })).toBeVisible()
    await expect(page.getByText("단계 진행률")).toHaveCount(0)
    await page.getByText(fixture.projectOrder.code).click()
    await expect(page.getByText("단계 완료율").first()).toBeVisible()
    await expect(page.getByText("프로젝트 진행률")).toHaveCount(0)

    await page.goto(`${BASE_URL}/app/mes/production-progress`, { waitUntil: "networkidle" })
    await expect(page.getByText("전체 생산 달성률").first()).toBeVisible()
    await expect(page.getByText("생산 달성률").first()).toBeVisible()
  } finally {
    await browser.close()
  }
}

main()
  .then(async () => {
    console.log("F23 browser smoke passed")
  })
  .catch(async (error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await cleanup()
    await prisma.$disconnect()
  })
