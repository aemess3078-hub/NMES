import { getEquipmentReport, getReportFilterOptions } from "@/lib/actions/report.actions"
import type { EquipStatFilter } from "@/lib/actions/equipment-statistics.actions"
import { EquipmentReportClient } from "./equipment-report-client"

export const dynamic = "force-dynamic"

interface PageProps {
  searchParams?: Promise<{
    from?: string
    to?: string
    equipmentId?: string
  }>
}

function defaultDateRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 30)
  const fmt = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
  return { from: fmt(from), to: fmt(to) }
}

export default async function EquipmentReportPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {}
  const defaults = defaultDateRange()

  const filter: EquipStatFilter = {
    from: params.from?.trim() || defaults.from,
    to: params.to?.trim() || defaults.to,
    equipmentId: params.equipmentId?.trim() || undefined,
  }

  const [data, options] = await Promise.all([
    getEquipmentReport(filter),
    getReportFilterOptions(),
  ])

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">설비리포트</h1>
        <p className="text-[15px] text-muted-foreground mt-1">
          기간별 설비 가동/비가동/알람 현황을 확인하고 Excel/인쇄로 출력합니다.
        </p>
      </div>
      <EquipmentReportClient
        initialFilter={{
          from: filter.from,
          to: filter.to,
          equipmentId: filter.equipmentId ?? "",
        }}
        data={data}
        equipments={options.equipments}
      />
    </div>
  )
}
