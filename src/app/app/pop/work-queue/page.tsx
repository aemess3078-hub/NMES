export const dynamic = "force-dynamic"

import { cookies } from "next/headers"

import { getPopWorkQueueRows } from "@/lib/actions/pop.actions"
import { WorkQueueClient } from "./work-queue-client"

export default async function PopWorkQueuePage() {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"
  const rows = await getPopWorkQueueRows(tenantId)

  return <WorkQueueClient rows={rows} />
}
