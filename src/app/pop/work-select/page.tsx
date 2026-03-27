export const dynamic = "force-dynamic"

import { getTodayWorkOrders } from "@/lib/actions/pop.actions"
import { WorkSelectClient } from "./work-select-client"
import { PopHeader } from "../components/pop-header"

export default async function WorkSelectPage() {
  // 데모: siteId 고정. 실제 환경에서는 쿠키/세션에서 siteId를 읽어야 함
  let workOrders: Awaited<ReturnType<typeof getTodayWorkOrders>> = []
  try {
    workOrders = await getTodayWorkOrders("site-a")
  } catch {
    // DB 연결 실패 시 빈 목록으로 처리
    workOrders = []
  }

  return (
    <div className="flex flex-col min-h-screen">
      <PopHeader workerName="데모 작업자" />
      <main className="flex-1 p-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-6">오늘의 작업</h1>
        <WorkSelectClient workOrders={workOrders} />
      </main>
    </div>
  )
}
