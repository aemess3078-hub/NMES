"use client"

import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { PlanWithDetails } from "@/lib/actions/production-plan.actions"
import { PlanStatus, PlanType } from "@prisma/client"

interface PlanDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: PlanWithDetails | null
}

const planTypeLabels: Record<PlanType, string> = {
  DAILY: "일간",
  WEEKLY: "주간",
  MONTHLY: "월간",
}

const planStatusLabels: Record<PlanStatus, string> = {
  DRAFT: "초안",
  CONFIRMED: "확정",
  IN_PROGRESS: "진행중",
  COMPLETED: "완료",
  CANCELLED: "취소",
}

const itemTypeLabels: Record<string, string> = {
  RAW_MATERIAL: "원자재",
  SEMI_FINISHED: "반제품",
  FINISHED: "완제품",
  CONSUMABLE: "소모품",
}

function formatDate(date: Date): string {
  return new Date(date).toISOString().split("T")[0]
}

export function PlanDetailSheet({ open, onOpenChange, plan }: PlanDetailSheetProps) {
  if (!plan) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl overflow-y-auto flex flex-col">
        <SheetHeader>
          <SheetTitle className="font-mono text-[18px]">{plan.planNo}</SheetTitle>
          <SheetDescription>생산계획 품목 상세</SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1 space-y-6">
          {/* 기본 정보 */}
          <div className="rounded-md border divide-y text-[14px]">
            <div className="flex items-center px-4 py-2.5">
              <span className="w-24 text-muted-foreground shrink-0">계획유형</span>
              <Badge variant="outline" className="text-[13px]">
                {planTypeLabels[plan.planType]}
              </Badge>
            </div>
            <div className="flex items-center px-4 py-2.5">
              <span className="w-24 text-muted-foreground shrink-0">공장</span>
              <span>{plan.site.name}</span>
            </div>
            <div className="flex items-center px-4 py-2.5">
              <span className="w-24 text-muted-foreground shrink-0">기간</span>
              <span className="text-muted-foreground">
                {formatDate(plan.startDate)} ~ {formatDate(plan.endDate)}
              </span>
            </div>
            <div className="flex items-center px-4 py-2.5">
              <span className="w-24 text-muted-foreground shrink-0">상태</span>
              <StatusBadge status={plan.status} label={planStatusLabels[plan.status]} />
            </div>
            {plan.note && (
              <div className="flex items-start px-4 py-2.5">
                <span className="w-24 text-muted-foreground shrink-0 pt-0.5">비고</span>
                <span className="text-muted-foreground">{plan.note}</span>
              </div>
            )}
          </div>

          {/* 품목 목록 */}
          <div className="space-y-2">
            <p className="text-[15px] font-medium">
              품목 목록
              <span className="ml-2 text-[13px] font-normal text-muted-foreground">
                {plan.items.length}건
              </span>
            </p>

            {plan.items.length === 0 ? (
              <div className="rounded-md border border-dashed py-8 text-center text-[14px] text-muted-foreground">
                등록된 품목이 없습니다.
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                        품목
                      </th>
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                        유형
                      </th>
                      <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">
                        계획수량
                      </th>
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                        BOM
                      </th>
                      <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
                        라우팅
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.items.map((planItem, index) => (
                      <tr
                        key={planItem.id}
                        className={`border-t ${index % 2 === 0 ? "" : "bg-muted/20"}`}
                      >
                        <td className="px-3 py-2.5">
                          <div className="font-medium">{planItem.item.name}</div>
                          <div className="text-muted-foreground text-[12px]">
                            {planItem.item.code}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {itemTypeLabels[planItem.item.itemType] ?? planItem.item.itemType}
                        </td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                          {Number(planItem.plannedQty).toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {planItem.bom?.version ?? (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {planItem.routing?.version ?? (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/30">
                      <td
                        colSpan={2}
                        className="px-3 py-2 text-[12px] text-muted-foreground font-medium"
                      >
                        합계
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {plan.items
                          .reduce((sum, i) => sum + Number(i.plannedQty), 0)
                          .toLocaleString()}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="mt-8 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function StatusBadge({ status, label }: { status: PlanStatus; label: string }) {
  if (status === "DRAFT")
    return <Badge variant="secondary" className="text-[13px]">{label}</Badge>
  if (status === "CONFIRMED")
    return <Badge variant="default" className="text-[13px]">{label}</Badge>
  if (status === "IN_PROGRESS")
    return (
      <Badge className="text-[13px] bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
        {label}
      </Badge>
    )
  if (status === "COMPLETED")
    return (
      <Badge className="text-[13px] bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
        {label}
      </Badge>
    )
  return <Badge variant="destructive" className="text-[13px]">{label}</Badge>
}
