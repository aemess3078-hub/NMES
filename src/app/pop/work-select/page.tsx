export const dynamic = "force-dynamic"

import { getTodayWorkOrders } from "@/lib/actions/pop.actions"
import { WorkSelectClient } from "./work-select-client"
import { PopHeader } from "../components/pop-header"

export default async function WorkSelectPage() {
  let workOrders: Awaited<ReturnType<typeof getTodayWorkOrders>> = []
  try {
    workOrders = await getTodayWorkOrders()
  } catch {
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
