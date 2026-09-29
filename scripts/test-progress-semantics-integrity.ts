import { readFileSync } from "node:fs"
import { join } from "node:path"
import { register } from "tsconfig-paths"
import type { ProductionProgressOperationInput } from "../src/lib/actions/production-progress.types"

register({
  baseUrl: process.cwd(),
  paths: { "@/*": ["src/*"] },
})

const { computeStageSummary } = require("../src/lib/project-stage-progress") as typeof import("../src/lib/project-stage-progress")
const {
  computeProductionOutputQty,
  computeProgressRate,
} = require("../src/lib/actions/production-progress.service") as typeof import("../src/lib/actions/production-progress.service")


let passed = 0
let failed = 0

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++
    console.log(`PASS ${label}`)
  } else {
    failed++
    console.error(`FAIL ${label}`)
  }
}

function formatValue(value: unknown): string {
  return typeof value === "object" ? JSON.stringify(value) : String(value)
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  assert(formatValue(actual) === formatValue(expected), `${label} (expected=${formatValue(expected)}, actual=${formatValue(actual)})`)
}

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

function runProjectStageCalculationAssertions() {
  assertEqual(
    computeStageSummary([
      { seq: 10, name: "A", status: "PENDING" },
      { seq: 20, name: "B", status: "PENDING" },
      { seq: 30, name: "C", status: "PENDING" },
    ]),
    { totalCount: 3, completedCount: 0, percent: 0 },
    "Project 단계 완료율: 모두 대기면 0/3 · 0%"
  )

  assertEqual(
    computeStageSummary([
      { seq: 10, name: "A", status: "COMPLETED" },
      { seq: 20, name: "B", status: "IN_PROGRESS" },
      { seq: 30, name: "C", status: "PENDING" },
    ]),
    { totalCount: 3, completedCount: 1, percent: 33 },
    "Project 단계 완료율: 1/3이면 반올림 33%"
  )

  assertEqual(
    computeStageSummary([
      { seq: 10, name: "A", status: "COMPLETED" },
      { seq: 20, name: "B", status: "COMPLETED" },
      { seq: 30, name: "C", status: "COMPLETED" },
    ]),
    { totalCount: 3, completedCount: 3, percent: 100 },
    "Project 단계 완료율: 모두 완료면 3/3 · 100%"
  )

  assertEqual(
    computeStageSummary([]),
    { totalCount: 0, completedCount: 0, percent: 0 },
    "Project 단계 완료율: 단계가 없으면 0/0 · 0%"
  )
}

function runProductionCalculationAssertions() {
  const operations: ProductionProgressOperationInput[] = [
    {
      id: "op10",
      seq: 10,
      status: "COMPLETED",
      plannedQty: 100,
      completedQty: 100,
      operationName: "OP10",
      routingOperationId: "rt10",
      equipmentName: null,
      assignments: [],
      productionResults: [{ goodQty: 100, startedAt: new Date("2026-09-29T00:00:00Z") }],
    },
    {
      id: "op20",
      seq: 20,
      status: "COMPLETED",
      plannedQty: 100,
      completedQty: 80,
      operationName: "OP20",
      routingOperationId: "rt20",
      equipmentName: null,
      assignments: [],
      productionResults: [{ goodQty: 80, startedAt: new Date("2026-09-29T01:00:00Z") }],
    },
    {
      id: "op30",
      seq: 30,
      status: "IN_PROGRESS",
      plannedQty: 100,
      completedQty: 50,
      operationName: "OP30",
      routingOperationId: "rt30",
      equipmentName: null,
      assignments: [],
      productionResults: [{ goodQty: 50, startedAt: new Date("2026-09-29T02:00:00Z") }],
    },
  ]

  const productionOutputQty = computeProductionOutputQty(operations)
  assertEqual(productionOutputQty, 50, "MES 생산실적: 실적 있는 최고 seq 공정 goodQty만 사용")
  assertEqual(computeProgressRate(100, productionOutputQty), 50, "MES 생산 달성률: productionOutputQty / WorkOrder.plannedQty")
}

function runSourceAssertions() {
  const projectPage = source("src/app/app/mes/project-progress/page.tsx")
  const projectColumns = source("src/app/app/mes/project-progress/columns.tsx")
  const projectDetail = source("src/app/app/mes/project-progress/project-progress-detail-sheet.tsx")
  const projectStageHelper = source("src/lib/project-stage-progress.ts")
  const productionColumns = source("src/app/app/mes/production-progress/columns.tsx")
  const productionClient = source("src/app/app/mes/production-progress/production-progress-client.tsx")
  const productionSummary = source("src/app/app/mes/production-progress/production-summary.tsx")
  const productionService = source("src/lib/actions/production-progress.service.ts")
  const salesOrderProgress = source("src/lib/sales-order-progress.server.ts")
  const productionDailyReport = source("src/app/app/mes/reports/production-daily/production-daily-report-client.tsx")
  const schema = source("prisma/schema.prisma")
  const f23BrowserSmoke = source("scripts/f23-browser-smoke.ts")

  assert(!projectPage.includes("단계 진행률"), "Project page에서 '단계 진행률' 표현 제거")
  assert(projectPage.includes("단계 완료율"), "Project page 설명이 단계 완료율 의미를 드러냄")
  assert(projectColumns.includes('header: "단계 완료율"'), "Project 목록 progress column header가 단계 완료율")
  assert(projectDetail.includes("단계 완료율"), "Project 상세 label이 단계 완료율")
  assert(!projectDetail.includes("프로젝트 진행률"), "Project 상세에서 모호한 프로젝트 진행률 label 제거")

  assert(productionColumns.includes('title="생산 달성률"'), "Production 목록 progressRate header가 생산 달성률")
  assert(productionClient.includes('label="전체 생산 달성률"'), "Production 상단 KPI label이 전체 생산 달성률")
  assert(productionSummary.includes('label="전체 생산 달성률"'), "Production 요약 기존 전체 생산 달성률 label 유지")

  assert(productionDailyReport.includes("진행률") && productionDailyReport.includes("전체진행률"), "F24 대상 production-daily report 진행률 label은 F23에서 미변경")
  assert(!schema.includes("productionProgress") && !schema.includes("progressPercent"), "Schema에 프로젝트 생산률/progressPercent 컬럼 없음")
  assert(salesOrderProgress.includes("computeProductionOutputQty") && salesOrderProgress.includes("producedQty"), "F22 sales-order progress 정본 파일은 유지")

  for (const forbidden of ["ProductionResult", "WorkOrder", "ProductionPlan", "sales-order-progress", "production-progress.service"]) {
    assert(!projectStageHelper.includes(forbidden), `Project stage helper가 MES 생산 정본(${forbidden})을 import/참조하지 않음`)
  }
  assert(!productionService.includes("ProjectStage") && !productionService.includes("computeStageSummary"), "Production progress service가 ProjectStage 단계 완료율을 참조하지 않음")

  assert(f23BrowserSmoke.includes('const REQUIRED_CHEONGUN_REF = "zgjoiyqtfivywajygevj"'), "F23 browser smoke가 청운 Supabase ref를 명시함")
  assert(f23BrowserSmoke.includes('const FORBIDDEN_CNS_REF = "rkglajpajtuavmptidur"'), "F23 browser smoke가 CNS Supabase ref를 명시 차단함")
  assert(f23BrowserSmoke.includes("function assertDbTarget()"), "F23 browser smoke가 DB target validation 함수를 가짐")
  assert(f23BrowserSmoke.includes("process.env.DATABASE_URL") && f23BrowserSmoke.includes("process.env.DIRECT_URL"), "F23 browser smoke가 DATABASE_URL과 DIRECT_URL을 검사함")
  assert(f23BrowserSmoke.indexOf("assertDbTarget()") < f23BrowserSmoke.indexOf("const fixture = await createFixture()"), "F23 browser smoke가 fixture 생성 전 DB target guard를 호출함")
  assert(f23BrowserSmoke.includes("F23 browser smoke refused CNS Supabase project"), "F23 browser smoke가 CNS DB를 fail-fast로 차단함")
}

runProjectStageCalculationAssertions()
runProductionCalculationAssertions()
runSourceAssertions()

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
