import {
  getDailyProductionReport,
  getReportFilterOptions,
  type DailyProductionReportFilter,
} from "@/lib/actions/report.actions"
import { toKstDateKey } from "@/lib/date/kst"
import { ProductionDailyReportClient } from "./production-daily-report-client"

export const dynamic = "force-dynamic"

interface PageProps {
  searchParams?: Promise<{
    from?: string
    to?: string
    siteId?: string
    itemId?: string
    routingOperationId?: string
  }>
}

function defaultDate(): string {
  return toKstDateKey(new Date())
}

export default async function ProductionDailyReportPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {}
  const today = defaultDate()

  const filter: DailyProductionReportFilter = {
    from: params.from?.trim() || today,
    to: params.to?.trim() || today,
    siteId: params.siteId?.trim() || undefined,
    itemId: params.itemId?.trim() || undefined,
    routingOperationId: params.routingOperationId?.trim() || undefined,
  }

  const [report, options] = await Promise.all([
    getDailyProductionReport(filter),
    getReportFilterOptions(),
  ])

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">생산일보</h1>
        <p className="text-[15px] text-muted-foreground mt-1">
          일자별 생산실적을 확인하고 Excel/인쇄로 출력합니다.
        </p>
      </div>
      <ProductionDailyReportClient
        initialFilter={{
          from: filter.from,
          to: filter.to,
          siteId: filter.siteId ?? "",
          itemId: filter.itemId ?? "",
          routingOperationId: filter.routingOperationId ?? "",
        }}
        report={report}
        options={options}
      />
    </div>
  )
}
