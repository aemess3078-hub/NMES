"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, PackageMinus, CheckCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { IssueFormDialog } from "./issue-form-dialog"
import {
  WorkOrderForIssue,
  WarehouseStockOption,
} from "@/lib/actions/material-issue.actions"

const WO_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  RELEASED: { label: "릴리즈", className: "bg-blue-100 text-blue-800 border-blue-200" },
  IN_PROGRESS: { label: "진행중", className: "bg-amber-100 text-amber-800 border-amber-200" },
}

interface MaterialIssueTableProps {
  data: WorkOrderForIssue[]
  warehouses: WarehouseStockOption[]
  tenantId: string
}

export function MaterialIssueTable({
  data,
  warehouses,
  tenantId,
}: MaterialIssueTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [issuingOrder, setIssuingOrder] = useState<WorkOrderForIssue | null>(null)

  function toggleExpand(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-16 text-center">
        <p className="text-[15px] text-muted-foreground">
          자재출고 대상 작업지시가 없습니다.
        </p>
        <p className="text-[13px] text-muted-foreground mt-1">
          RELEASED 또는 IN_PROGRESS 상태의 작업지시가 여기에 표시됩니다.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-lg border overflow-hidden">
        {/* 헤더 */}
        <div className="grid grid-cols-[40px_1fr_1fr_120px_1fr_140px] bg-muted/30 border-b">
          <div className="py-2.5 px-3" />
          <div className="py-2.5 px-3 text-[13px] font-medium text-muted-foreground">작업지시번호</div>
          <div className="py-2.5 px-3 text-[13px] font-medium text-muted-foreground">품목</div>
          <div className="py-2.5 px-3 text-[13px] font-medium text-muted-foreground text-right">계획수량</div>
          <div className="py-2.5 px-3 text-[13px] font-medium text-muted-foreground">자재 현황</div>
          <div className="py-2.5 px-3 text-[13px] font-medium text-muted-foreground text-right">처리</div>
        </div>

        {/* 바디 */}
        <div className="divide-y">
          {data.map((wo) => {
            const isExpanded = expandedRows.has(wo.id)
            const cfg = WO_STATUS_CONFIG[wo.status] ?? { label: wo.status, className: "" }
            const pendingCount = wo.materials.filter((m) => m.pendingQty > 0).length

            return (
              <div key={wo.id}>
                {/* 작업지시 행 */}
                <div className="grid grid-cols-[40px_1fr_1fr_120px_1fr_140px] items-center hover:bg-muted/20 transition-colors">
                  <button
                    className="flex items-center justify-center h-full py-3 px-3 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => toggleExpand(wo.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>

                  <div className="py-3 px-3">
                    <span className="font-mono text-[13px] font-medium">{wo.orderNo}</span>
                  </div>

                  <div className="py-3 px-3">
                    <div className="text-[14px] font-medium">{wo.item.name}</div>
                    <div className="text-[12px] text-muted-foreground font-mono">{wo.item.code}</div>
                  </div>

                  <div className="py-3 px-3 text-right">
                    <span className="text-[14px]">{wo.plannedQty.toLocaleString()}</span>
                  </div>

                  <div className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[12px] ${cfg.className}`}>
                        {cfg.label}
                      </Badge>
                      {wo.allIssued ? (
                        <span className="flex items-center gap-1 text-[12px] text-green-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          출고완료
                        </span>
                      ) : (
                        <span className="text-[12px] text-amber-700">
                          {pendingCount}개 품목 대기
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="py-3 px-3 flex justify-end">
                    {!wo.allIssued && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[13px] gap-1.5"
                        onClick={() => setIssuingOrder(wo)}
                      >
                        <PackageMinus className="h-3.5 w-3.5" />
                        출고처리
                      </Button>
                    )}
                  </div>
                </div>

                {/* 자재 상세 (확장) */}
                {isExpanded && (
                  <div className="bg-muted/10 border-t px-4 py-3">
                    {wo.materials.length === 0 ? (
                      <p className="text-[13px] text-muted-foreground">BOM 자재 정보가 없습니다.</p>
                    ) : (
                      <table className="w-full text-[13px]">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">품목명</th>
                            <th className="text-left py-1.5 px-2 font-medium text-muted-foreground w-16">단위</th>
                            <th className="text-right py-1.5 px-2 font-medium text-muted-foreground w-24">필요수량</th>
                            <th className="text-right py-1.5 px-2 font-medium text-muted-foreground w-24">출고완료</th>
                            <th className="text-right py-1.5 px-2 font-medium text-muted-foreground w-24">잔여수량</th>
                            <th className="text-right py-1.5 px-2 font-medium text-muted-foreground w-24">가용재고</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {wo.materials.map((m) => (
                            <tr key={m.itemId} className="hover:bg-muted/20">
                              <td className="py-1.5 px-2">
                                <div>{m.item.name}</div>
                                <div className="font-mono text-[11px] text-muted-foreground">
                                  {m.item.code}
                                </div>
                              </td>
                              <td className="py-1.5 px-2 text-muted-foreground">{m.item.uom}</td>
                              <td className="py-1.5 px-2 text-right">{m.requiredQty.toLocaleString()}</td>
                              <td className="py-1.5 px-2 text-right text-muted-foreground">
                                {m.issuedQty.toLocaleString()}
                              </td>
                              <td className={`py-1.5 px-2 text-right font-medium ${m.pendingQty > 0 ? "text-amber-600" : "text-green-600"}`}>
                                {m.pendingQty.toLocaleString()}
                              </td>
                              <td className={`py-1.5 px-2 text-right font-medium ${m.currentStock < m.pendingQty ? "text-red-600" : "text-slate-700"}`}>
                                {m.currentStock.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <IssueFormDialog
        open={!!issuingOrder}
        onOpenChange={(v) => { if (!v) setIssuingOrder(null) }}
        workOrder={issuingOrder}
        warehouses={warehouses}
        tenantId={tenantId}
      />
    </>
  )
}
