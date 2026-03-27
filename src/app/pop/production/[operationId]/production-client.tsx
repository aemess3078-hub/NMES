"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  submitProductionResult,
  updateOperationStatus,
} from "@/lib/actions/pop.actions"
import { PopQuantityInput } from "../../components/pop-quantity-input"

type ProductionResult = {
  id: string
  goodQty: unknown
  defectQty: unknown
  reworkQty: unknown
  startedAt: Date | string | null
}

type RoutingOperation = {
  name: string
}

type Equipment = {
  name: string
}

type Item = {
  name: string
  code: string
}

type WorkOrder = {
  orderNo: string
  item: Item | null
}

type Operation = {
  id: string
  seq: number
  status: string
  plannedQty: unknown
  completedQty: unknown
  workOrder: WorkOrder | null
  routingOperation: RoutingOperation | null
  equipment: Equipment | null
  productionResults: ProductionResult[]
}

type Props = {
  operation: Operation
}

export function ProductionClient({ operation }: Props) {
  const router = useRouter()
  const [goodQty, setGoodQty] = useState(0)
  const [defectQty, setDefectQty] = useState(0)
  const [reworkQty, setReworkQty] = useState(0)
  const [loading, setLoading] = useState(false)

  const wo = operation.workOrder
  const status = operation.status
  const completedQty = Number(operation.completedQty)
  const plannedQty = Number(operation.plannedQty)
  const progress =
    plannedQty > 0
      ? Math.min(100, Math.round((completedQty / plannedQty) * 100))
      : 0

  const handleStart = async () => {
    setLoading(true)
    await updateOperationStatus(operation.id, "IN_PROGRESS")
    router.refresh()
    setLoading(false)
  }

  const handleSubmit = async () => {
    if (goodQty + defectQty + reworkQty === 0) return
    setLoading(true)
    await submitProductionResult({
      workOrderOperationId: operation.id,
      goodQty,
      defectQty,
      reworkQty,
    })
    setGoodQty(0)
    setDefectQty(0)
    setReworkQty(0)
    router.refresh()
    setLoading(false)
  }

  const handleComplete = async () => {
    if (!confirm("작업을 완료 처리하겠습니까?")) return
    setLoading(true)
    await updateOperationStatus(operation.id, "COMPLETED")
    router.push("/pop/work-select")
  }

  const statusLabel =
    status === "PENDING" ? "대기" : status === "IN_PROGRESS" ? "진행중" : "완료"

  const statusClass =
    status === "IN_PROGRESS"
      ? "bg-amber-100 text-amber-800"
      : status === "COMPLETED"
      ? "bg-green-100 text-green-800"
      : "bg-slate-100 text-slate-600"

  return (
    <div className="space-y-6">
      {/* 작업 정보 */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-mono text-sm text-slate-500">{wo?.orderNo}</div>
            <div className="text-xl font-bold text-slate-800 mt-1">
              {wo?.item?.name}
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusClass}`}>
            {statusLabel}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-500">현재 공정</span>
            <div className="font-semibold mt-1">
              {operation.seq}. {operation.routingOperation?.name}
            </div>
          </div>
          <div>
            <span className="text-slate-500">설비</span>
            <div className="font-semibold mt-1">
              {operation.equipment?.name ?? "—"}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex justify-between text-sm text-slate-500 mb-1">
            <span>
              진행률 ({completedQty} / {plannedQty}개)
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-3 bg-slate-200 rounded-full">
            <div
              className="h-3 bg-blue-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* 수량 입력 (IN_PROGRESS일 때만) */}
      {status === "IN_PROGRESS" && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 space-y-4">
          <h2 className="font-bold text-lg text-slate-800">실적 입력</h2>
          <PopQuantityInput label="양품" value={goodQty} onChange={setGoodQty} />
          <PopQuantityInput label="불량" value={defectQty} onChange={setDefectQty} />
          <PopQuantityInput label="재작업" value={reworkQty} onChange={setReworkQty} />
        </div>
      )}

      {/* 이전 실적 이력 */}
      {operation.productionResults.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200">
          <h2 className="font-bold text-lg text-slate-800 mb-4">실적 이력</h2>
          <div className="space-y-2">
            {operation.productionResults.slice(0, 5).map((r) => (
              <div
                key={r.id}
                className="flex justify-between text-sm py-2 border-b last:border-0"
              >
                <span className="text-slate-500">
                  {r.startedAt
                    ? new Date(r.startedAt).toLocaleTimeString("ko-KR")
                    : "—"}
                </span>
                <span>양품 {Number(r.goodQty)}</span>
                <span className="text-red-600">불량 {Number(r.defectQty)}</span>
                <span className="text-amber-600">
                  재작업 {Number(r.reworkQty)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="space-y-3">
        {status === "PENDING" && (
          <button
            onClick={handleStart}
            disabled={loading}
            className="w-full h-16 text-lg font-bold bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50"
          >
            작업 시작
          </button>
        )}

        {status === "IN_PROGRESS" && (
          <>
            <button
              onClick={handleSubmit}
              disabled={loading || goodQty + defectQty + reworkQty === 0}
              className="w-full h-16 text-lg font-bold bg-blue-500 hover:bg-blue-600 text-white rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50"
            >
              실적 등록
            </button>
            <button
              onClick={handleComplete}
              disabled={loading}
              className="w-full h-16 text-lg font-bold bg-red-500 hover:bg-red-600 text-white rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50"
            >
              작업 완료
            </button>
          </>
        )}

        {status === "COMPLETED" && (
          <button
            onClick={() => router.push("/pop/work-select")}
            className="w-full h-16 text-lg font-bold bg-slate-500 hover:bg-slate-600 text-white rounded-2xl transition-all active:scale-[0.98]"
          >
            작업 목록으로
          </button>
        )}

        <button
          onClick={() => router.push("/pop/work-select")}
          className="w-full h-12 text-base text-slate-500 hover:text-slate-700 transition-colors"
        >
          목록으로 돌아가기
        </button>
      </div>
    </div>
  )
}
