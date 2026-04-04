"use client"

import { format } from "date-fns"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { SalesOrderRow } from "./columns"
import { SalesOrderStatus } from "@prisma/client"

interface SalesOrderDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  salesOrder: SalesOrderRow | null
}

const STATUS_CONFIG: Record<
  SalesOrderStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  DRAFT:           { label: "초안",     variant: "secondary" },
  CONFIRMED:       { label: "확정",     variant: "default" },
  IN_PRODUCTION:   { label: "생산중",   variant: "default" },
  PARTIAL_SHIPPED: { label: "부분출하", variant: "outline" },
  SHIPPED:         { label: "출하완료", variant: "default" },
  CLOSED:          { label: "완료",     variant: "secondary" },
  CANCELLED:       { label: "취소",     variant: "destructive" },
}

export function SalesOrderDetailSheet({
  open,
  onOpenChange,
  salesOrder,
}: SalesOrderDetailSheetProps) {
  if (!salesOrder) return null

  const statusCfg = STATUS_CONFIG[salesOrder.status]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="pb-6 border-b">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <SheetTitle className="text-[20px] font-semibold font-mono">
                {salesOrder.orderNo}
              </SheetTitle>
              <p className="text-[15px] text-muted-foreground font-medium">
                {salesOrder.customer.name}
              </p>
            </div>
            <Badge variant={statusCfg.variant} className="text-[13px] mt-1">
              {statusCfg.label}
            </Badge>
          </div>

          <div className="flex gap-6 pt-2">
            <div className="space-y-0.5">
              <p className="text-[12px] text-muted-foreground uppercase tracking-wide">수주일</p>
              <p className="text-[14px] font-medium">
                {format(new Date(salesOrder.orderDate), "yyyy-MM-dd")}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[12px] text-muted-foreground uppercase tracking-wide">납기일</p>
              <p className="text-[14px] font-medium">
                {format(new Date(salesOrder.deliveryDate), "yyyy-MM-dd")}
              </p>
            </div>
            {salesOrder.totalAmount && (
              <div className="space-y-0.5">
                <p className="text-[12px] text-muted-foreground uppercase tracking-wide">총금액</p>
                <p className="text-[14px] font-semibold">
                  {Number(salesOrder.totalAmount).toLocaleString()} {salesOrder.currency}
                </p>
              </div>
            )}
          </div>
        </SheetHeader>

        <div className="pt-6">
          <h3 className="text-[15px] font-semibold mb-3">품목 목록</h3>

          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-3 py-2.5 text-[13px] font-medium text-muted-foreground w-8">
                    #
                  </th>
                  <th className="text-left px-3 py-2.5 text-[13px] font-medium text-muted-foreground">
                    품목코드
                  </th>
                  <th className="text-left px-3 py-2.5 text-[13px] font-medium text-muted-foreground">
                    품목명
                  </th>
                  <th className="text-center px-3 py-2.5 text-[13px] font-medium text-muted-foreground">
                    UOM
                  </th>
                  <th className="text-right px-3 py-2.5 text-[13px] font-medium text-muted-foreground">
                    수주수량
                  </th>
                  <th className="text-right px-3 py-2.5 text-[13px] font-medium text-muted-foreground">
                    출하완료
                  </th>
                  <th className="text-right px-3 py-2.5 text-[13px] font-medium text-muted-foreground">
                    잔여수량
                  </th>
                  <th className="text-right px-3 py-2.5 text-[13px] font-medium text-muted-foreground">
                    단가
                  </th>
                  <th className="text-center px-3 py-2.5 text-[13px] font-medium text-muted-foreground">
                    납기일
                  </th>
                  <th className="text-left px-3 py-2.5 text-[13px] font-medium text-muted-foreground">
                    비고
                  </th>
                </tr>
              </thead>
              <tbody>
                {salesOrder.items.map((item, idx) => {
                  const orderedQty = Number(item.qty)
                  const shippedQty = Number(item.shippedQty ?? 0)
                  const remainingQty = Math.max(0, orderedQty - shippedQty)

                  return (
                    <tr
                      key={item.id}
                      className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-3 py-2.5 text-[13px] text-muted-foreground">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-[13px] text-muted-foreground">
                          {item.item.code}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[14px] font-medium">{item.item.name}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-[13px] text-muted-foreground">{item.item.uom}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-[14px] font-medium tabular-nums">
                          {orderedQty.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className={`text-[13px] tabular-nums ${
                            shippedQty > 0 ? "text-green-700 font-medium" : "text-muted-foreground"
                          }`}
                        >
                          {shippedQty > 0 ? shippedQty.toLocaleString() : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className={`text-[13px] font-medium tabular-nums ${
                            remainingQty > 0 ? "text-amber-600" : "text-muted-foreground"
                          }`}
                        >
                          {remainingQty.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {item.unitPrice ? (
                          <span className="text-[13px] tabular-nums">
                            {Number(item.unitPrice).toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-[13px] text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {item.deliveryDate ? (
                          <span className="text-[13px] text-muted-foreground">
                            {format(new Date(item.deliveryDate), "MM-dd")}
                          </span>
                        ) : (
                          <span className="text-[13px] text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[13px] text-muted-foreground">
                          {item.note ?? "—"}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {salesOrder.items.length === 0 && (
            <div className="text-center py-8 text-[14px] text-muted-foreground">
              등록된 품목이 없습니다.
            </div>
          )}

          {salesOrder.totalAmount && (
            <div className="mt-4 flex justify-end">
              <div className="bg-muted/50 rounded-lg px-4 py-3 text-right">
                <p className="text-[13px] text-muted-foreground mb-0.5">총 금액</p>
                <p className="text-[18px] font-semibold tabular-nums">
                  {Number(salesOrder.totalAmount).toLocaleString()}{" "}
                  <span className="text-[14px] font-normal text-muted-foreground">
                    {salesOrder.currency}
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
