"use client"

import { useState } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  searchLotByNo,
  getLotForwardTrace,
  getLotBackwardTrace,
  LotGenealogyNode,
} from "@/lib/actions/lot.actions"

// ─── Types ────────────────────────────────────────────────────────────────────

type TraceDirection = "forward" | "backward" | "both"

type TraceResult = {
  forward: LotGenealogyNode | null
  backward: LotGenealogyNode | null
}

// ─── Relation labels ──────────────────────────────────────────────────────────

const RELATION_LABELS: Record<string, string> = {
  INPUT:  "투입",
  OUTPUT: "산출",
  REWORK: "재작업",
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ACTIVE:     { label: "활성",   className: "bg-green-100 text-green-800" },
  QUARANTINE: { label: "격리",   className: "bg-amber-100 text-amber-800" },
  ON_HOLD:    { label: "보류",   className: "bg-blue-100 text-blue-800" },
  CONSUMED:   { label: "소진",   className: "bg-slate-100 text-slate-600" },
  EXPIRED:    { label: "만료",   className: "bg-red-100 text-red-800" },
}

// ─── LOT 트리 노드 (재귀) ─────────────────────────────────────────────────────

function LotTreeView({
  node,
  depth = 0,
}: {
  node: LotGenealogyNode
  depth?: number
}) {
  if (!node) return null
  const statusCfg = STATUS_CONFIG[node.status]

  return (
    <div className={depth > 0 ? "ml-6 mt-2 pl-4 border-l-2 border-slate-200" : ""}>
      <div
        className={`flex items-start gap-2 p-3 rounded-lg border ${
          depth === 0
            ? "bg-blue-50 border-blue-200"
            : "bg-slate-50 border-slate-200"
        }`}
      >
        <div className="flex-1 min-w-0">
          {node.relationType && (
            <span className="text-[12px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full mr-2 font-medium">
              {RELATION_LABELS[node.relationType] ?? node.relationType}
            </span>
          )}
          <span className="font-mono font-bold text-[14px]">{node.lotNo}</span>
          <span className="text-slate-500 text-[13px] ml-2">{node.itemName}</span>
          <span className="text-slate-400 text-[12px] ml-1">({node.itemCode})</span>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className={`text-[12px] px-2 py-0.5 rounded-full font-medium ${
                statusCfg?.className ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {statusCfg?.label ?? node.status}
            </span>
            <span className="text-[12px] text-slate-500">
              재고: {Number(node.qty).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
      {node.children?.map((child, i) => (
        <LotTreeView key={`${child.id}-${i}`} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface TraceabilityClientProps {
  initialLotId?: string
  tenantId: string
}

export function TraceabilityClient({
  initialLotId,
  tenantId,
}: TraceabilityClientProps) {
  const [query, setQuery] = useState("")
  const [direction, setDirection] = useState<TraceDirection>("both")
  const [searchResult, setSearchResult] = useState<any>(null)
  const [traceTree, setTraceTree] = useState<TraceResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async () => {
    const q = query.trim()
    if (!q) return

    setLoading(true)
    setError(null)
    setSearchResult(null)
    setTraceTree(null)

    try {
      const lot = await searchLotByNo(q, tenantId)
      if (!lot) {
        setError(`'${q}' LOT를 찾을 수 없습니다.`)
        return
      }
      setSearchResult(lot)

      if (direction === "forward") {
        const fwd = await getLotForwardTrace(lot.id)
        setTraceTree({ forward: fwd, backward: null })
      } else if (direction === "backward") {
        const bwd = await getLotBackwardTrace(lot.id)
        setTraceTree({ forward: null, backward: bwd })
      } else {
        const [fwd, bwd] = await Promise.all([
          getLotForwardTrace(lot.id),
          getLotBackwardTrace(lot.id),
        ])
        setTraceTree({ forward: fwd, backward: bwd })
      }
    } catch (e) {
      setError("추적 중 오류가 발생했습니다.")
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const hasForward =
    traceTree?.forward &&
    (traceTree.forward.children?.length ?? 0) > 0

  const hasBackward =
    traceTree?.backward &&
    (traceTree.backward.children?.length ?? 0) > 0

  return (
    <div className="space-y-6">
      {/* 검색 영역 */}
      <div className="bg-white rounded-xl border p-6">
        <p className="text-[15px] font-medium text-foreground mb-4">LOT 번호로 추적</p>
        <div className="flex gap-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="LOT 번호 입력 (부분 검색 가능)..."
            className="flex-1 text-[14px]"
          />
          <Select
            value={direction}
            onValueChange={(v) => setDirection(v as TraceDirection)}
          >
            <SelectTrigger className="w-44 text-[14px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="both" className="text-[14px]">정/역추적 (양방향)</SelectItem>
              <SelectItem value="forward" className="text-[14px]">정추적 (어디로 갔나)</SelectItem>
              <SelectItem value="backward" className="text-[14px]">역추적 (어디서 왔나)</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="gap-2 shrink-0"
          >
            <Search className="h-4 w-4" />
            {loading ? "추적 중..." : "추적"}
          </Button>
        </div>
        {error && (
          <p className="text-red-500 text-[14px] mt-3">{error}</p>
        )}
      </div>

      {/* 기준 LOT 정보 */}
      {searchResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-[13px] font-semibold text-blue-700 mb-2">기준 LOT</p>
          <div className="flex flex-wrap gap-6 text-[14px]">
            <span className="font-mono font-bold text-blue-900">
              {searchResult.lotNo}
            </span>
            <span className="text-blue-800">{searchResult.item?.name}</span>
            <span className="text-blue-700">
              ({searchResult.item?.code})
            </span>
            <span className="text-blue-700">
              상태: {STATUS_CONFIG[searchResult.status]?.label ?? searchResult.status}
            </span>
          </div>
        </div>
      )}

      {/* 트리 시각화 */}
      {traceTree && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 역추적 */}
          {traceTree.backward && (
            <div className="bg-white rounded-xl border p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-0.5 w-4 bg-slate-400" />
                <h3 className="text-[15px] font-semibold text-slate-700">
                  역추적 (원자재 방향)
                </h3>
              </div>
              {hasBackward ? (
                <LotTreeView node={traceTree.backward} />
              ) : (
                <div className="text-center py-8 text-[14px] text-muted-foreground">
                  <div className="mb-2">
                    <LotTreeView node={traceTree.backward} />
                  </div>
                  <p className="text-[13px] mt-4 text-slate-400">
                    부모 LOT가 없습니다. (원자재 출발점)
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 정추적 */}
          {traceTree.forward && (
            <div className="bg-white rounded-xl border p-6">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-[15px] font-semibold text-slate-700">
                  정추적 (제품 방향)
                </h3>
                <div className="h-0.5 w-4 bg-slate-400" />
              </div>
              {hasForward ? (
                <LotTreeView node={traceTree.forward} />
              ) : (
                <div>
                  <LotTreeView node={traceTree.forward} />
                  <p className="text-[13px] mt-4 text-center text-slate-400">
                    자식 LOT가 없습니다. (최종 제품 또는 소진)
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 안내 메시지 (초기 상태) */}
      {!traceTree && !loading && !error && (
        <div className="bg-slate-50 rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <Search className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-[15px] text-slate-500">
            LOT 번호를 입력하고 추적 버튼을 클릭하세요.
          </p>
          <p className="text-[13px] text-slate-400 mt-1">
            정추적: 이 LOT가 어느 제품으로 변환되었는지 / 역추적: 이 LOT가 어느 원자재로부터 왔는지
          </p>
        </div>
      )}
    </div>
  )
}
