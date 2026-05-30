export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { getOperationDetail } from "@/lib/actions/pop.actions"
import { ProductionClient } from "./production-client"
import { PopHeader } from "../../components/pop-header"

type Props = {
  params: Promise<{ operationId: string }>
  searchParams?: Promise<{ assignmentId?: string | string[] }>
}

export default async function ProductionPage({ params, searchParams }: Props) {
  const { operationId } = await params
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const rawAssignmentId = resolvedSearchParams.assignmentId
  const assignmentId = Array.isArray(rawAssignmentId) ? rawAssignmentId[0] : rawAssignmentId
  const op = await getOperationDetail(operationId, assignmentId)
  if (!op) notFound()

  return (
    <div className="flex flex-col min-h-screen">
      <PopHeader workerName="데모 작업자" />
      <main className="flex-1 p-6 max-w-2xl mx-auto w-full">
        <ProductionClient operation={op} />
      </main>
    </div>
  )
}
