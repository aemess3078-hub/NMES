"use server"

// ─── 청운커팅 사업계획서 "리포트" — 생산일보 / 품질리포트 / 설비리포트 ───────
//
// 이 파일은 새 업무 데이터를 만들지 않는다. 이미 존재하는 정본 조회 로직
// (getProductionResults / getDefectStats / getEquipmentStatisticsData)을
// 그대로 감싸거나(품질/설비) 그 위에 순수 집계만 얹어(생산일보) 조회·출력용
// 화면에 데이터를 공급하는 역할만 한다. DB schema 변경 없음, 신규 mutation
// 없음(§ STEP 20).

import { requireRole } from "@/lib/auth"
import {
  getProductionResults,
  type ProductionResultFilters,
} from "./production-result.actions"
import {
  getDefectStats,
  getDefectStatsFilterOptions,
  type DefectStatsFilter,
  type DefectStatsResult,
} from "./defect-stats.actions"
import {
  getEquipmentStatisticsData,
  getEquipmentOptions,
  type EquipStatFilter,
  type EquipmentStatisticsData,
} from "./equipment-statistics.actions"
import {
  buildDailyProductionRows,
  groupDailyProductionByDate,
  computeDailyProductionSummary,
  type DailyProductionDateGroup,
  type DailyProductionSummaryTotals,
} from "./report.helpers"

export type { DailyProductionDateGroup, DailyProductionSummaryTotals }
export type { DefectStatsResult, DefectStatsFilter }
export type { EquipmentStatisticsData, EquipStatFilter }

// ─── 생산일보 ────────────────────────────────────────────────────────────────

export type DailyProductionReportFilter = {
  from: string // YYYY-MM-DD, KST
  to: string
  itemId?: string
  routingOperationId?: string
}

export type DailyProductionReportData = {
  filter: DailyProductionReportFilter
  summary: DailyProductionSummaryTotals
  dateGroups: DailyProductionDateGroup[]
}

function toKstRange(from: string, to: string): { startDate: Date; endDate: Date } {
  return {
    startDate: new Date(`${from}T00:00:00.000+09:00`),
    endDate: new Date(`${to}T23:59:59.999+09:00`),
  }
}

export async function getDailyProductionReport(
  filter: DailyProductionReportFilter
): Promise<DailyProductionReportData> {
  await requireRole("VIEWER")
  const { startDate, endDate } = toKstRange(filter.from, filter.to)

  const productionFilter: ProductionResultFilters = {
    startDate,
    endDate,
    itemId: filter.itemId,
    routingOperationId: filter.routingOperationId,
  }
  const results = await getProductionResults(productionFilter)

  const rows = buildDailyProductionRows(results)
  const dateGroups = groupDailyProductionByDate(rows)
  const summary = computeDailyProductionSummary(results, rows)

  return { filter, summary, dateGroups }
}

// ─── 품질리포트 — 기존 불량분석(getDefectStats) 정본을 그대로 재사용 ─────────

export async function getQualityReport(filter: DefectStatsFilter): Promise<DefectStatsResult> {
  await requireRole("VIEWER")
  return getDefectStats(filter)
}

// ─── 설비리포트 — 기존 설비 통합통계(getEquipmentStatisticsData) 정본을 재사용 ─

export async function getEquipmentReport(
  filter: EquipStatFilter
): Promise<EquipmentStatisticsData> {
  await requireRole("VIEWER")
  return getEquipmentStatisticsData(filter)
}

// ─── 공통 필터 옵션(품목/공정/설비) ───────────────────────────────────────────

export type ReportFilterOptions = {
  items: { id: string; code: string; name: string }[]
  routingOperations: {
    id: string
    name: string
    seq: number
    routingCode: string
    routingName: string
  }[]
  equipments: { id: string; code: string; name: string }[]
}

export async function getReportFilterOptions(): Promise<ReportFilterOptions> {
  await requireRole("VIEWER")
  const [itemOperationOptions, equipments] = await Promise.all([
    getDefectStatsFilterOptions(),
    getEquipmentOptions(),
  ])
  return { ...itemOperationOptions, equipments }
}
