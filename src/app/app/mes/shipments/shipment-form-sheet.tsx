"use client"

import { useState, useEffect } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"

import { Form, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FormSheet } from "@/components/common/form-sheet/form-sheet"
import { shipmentFormSchema, ShipmentFormValues } from "./shipment-form-schema"
import { createShipment } from "@/lib/actions/shipment.actions"

// ─── Types ────────────────────────────────────────────────────────────────────

type SalesOrderOption = {
  id: string
  orderNo: string
  customer: { name: string }
  items: {
    id: string
    itemId: string
    qty: number | string
    shippedQty: number | string
    item: { id: string; code: string; name: string }
  }[]
}

type WarehouseOption = { id: string; code: string; name: string }

interface ShipmentFormSheetProps {
  tenantId: string
  siteId: string
  salesOrders: SalesOrderOption[]
  warehouses: WarehouseOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultSalesOrderId?: string
}

// ─── Default Values ───────────────────────────────────────────────────────────

const DEFAULT_VALUES: ShipmentFormValues = {
  salesOrderId: "",
  plannedDate: new Date().toISOString().split("T")[0],
  warehouseId: undefined,
  note: "",
  items: [],
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ShipmentFormSheet({
  tenantId,
  siteId,
  salesOrders,
  warehouses,
  open,
  onOpenChange,
  defaultSalesOrderId,
}: ShipmentFormSheetProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const form = useForm<ShipmentFormValues>({
    resolver: zodResolver(shipmentFormSchema),
    defaultValues: DEFAULT_VALUES,
  })

  const { fields, replace, remove } = useFieldArray({
    control: form.control,
    name: "items",
  })

  // ─── Sheet 열릴 때 초기화 ────────────────────────────────────────────────────

  useEffect(() => {
    if (open) {
      const base = {
        ...DEFAULT_VALUES,
        plannedDate: new Date().toISOString().split("T")[0],
      }
      if (defaultSalesOrderId) {
        form.reset({ ...base, salesOrderId: defaultSalesOrderId })
        // 미출하 품목 자동 로딩
        const selectedOrder = salesOrders.find((so) => so.id === defaultSalesOrderId)
        if (selectedOrder) {
          const shippableItems = selectedOrder.items.filter(
            (i) => Number(i.qty) - Number(i.shippedQty) > 0
          )
          replace(
            shippableItems.map((i) => ({
              salesOrderItemId: i.id,
              itemId: i.itemId,
              qty: Number(i.qty) - Number(i.shippedQty),
              lotId: undefined,
            }))
          )
        }
      } else {
        form.reset(base)
        replace([])
      }
    }
  }, [open, defaultSalesOrderId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 수주 선택 핸들러 ────────────────────────────────────────────────────────

  const handleSalesOrderChange = (salesOrderId: string) => {
    form.setValue("salesOrderId", salesOrderId)
    const selectedOrder = salesOrders.find((so) => so.id === salesOrderId)
    if (!selectedOrder) {
      replace([])
      return
    }

    // 미출하 품목만 (qty - shippedQty > 0)
    const shippableItems = selectedOrder.items.filter(
      (i) => Number(i.qty) - Number(i.shippedQty) > 0
    )

    replace(
      shippableItems.map((i) => ({
        salesOrderItemId: i.id,
        itemId: i.itemId,
        qty: Number(i.qty) - Number(i.shippedQty),
        lotId: undefined,
      }))
    )
  }

  // ─── 저장 핸들러 ────────────────────────────────────────────────────────────

  async function onSubmit(values: ShipmentFormValues) {
    setIsLoading(true)
    try {
      await createShipment(tenantId, siteId, {
        salesOrderId: values.salesOrderId,
        plannedDate: new Date(values.plannedDate),
        warehouseId: values.warehouseId || undefined,
        note: values.note,
        items: values.items.map((item) => ({
          salesOrderItemId: item.salesOrderItemId,
          itemId: item.itemId,
          qty: item.qty,
          lotId: item.lotId || undefined,
        })),
      })
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      console.error("저장 실패:", error)
      alert(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.")
    } finally {
      setIsLoading(false)
    }
  }

  // ─── 현재 선택된 수주의 품목 정보 ────────────────────────────────────────────

  const selectedOrderId = form.watch("salesOrderId")
  const selectedOrder = salesOrders.find((so) => so.id === selectedOrderId)

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      title="출하 등록"
      description="수주 기반으로 출하를 등록합니다."
      isLoading={isLoading}
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <Form {...form}>
        <div className="space-y-6">
          {/* 기본 정보 */}
          <div className="space-y-4">
            <p className="text-[15px] font-medium text-foreground">기본 정보</p>

            {/* 수주 선택 */}
            <FormField
              control={form.control}
              name="salesOrderId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>수주</FormLabel>
                  <Select
                    onValueChange={(val) => handleSalesOrderChange(val)}
                    value={field.value ?? undefined}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="출하할 수주 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {salesOrders.map((so) => (
                        <SelectItem key={so.id} value={so.id}>
                          {so.orderNo} — {so.customer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              {/* 출하예정일 */}
              <FormField
                control={form.control}
                name="plannedDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>출하예정일</FormLabel>
                    <Input type="date" {...field} value={field.value ?? ""} />
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 창고 */}
              <FormField
                control={form.control}
                name="warehouseId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>창고 (선택)</FormLabel>
                    <Select
                      onValueChange={(val) =>
                        field.onChange(val === "__none__" ? undefined : val)
                      }
                      value={field.value ?? "__none__"}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="창고 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">선택 안함</SelectItem>
                        {warehouses.map((wh) => (
                          <SelectItem key={wh.id} value={wh.id}>
                            [{wh.code}] {wh.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* 비고 */}
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>비고</FormLabel>
                  <Textarea
                    placeholder="비고 사항을 입력하세요"
                    className="resize-none h-20"
                    {...field}
                    value={field.value ?? ""}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* 출하 품목 */}
          <div className="pt-4 border-t space-y-3">
            <p className="text-[15px] font-medium text-foreground">출하 품목</p>

            {!selectedOrderId && (
              <div className="rounded-md border border-dashed py-8 text-center text-[14px] text-muted-foreground">
                수주를 선택하면 미출하 품목이 자동으로 로딩됩니다.
              </div>
            )}

            {selectedOrderId && fields.length === 0 && (
              <div className="rounded-md border border-dashed py-8 text-center text-[14px] text-muted-foreground">
                미출하 품목이 없습니다.
              </div>
            )}

            {fields.length > 0 && (
              <div className="rounded-md border overflow-hidden">
                {/* 헤더 */}
                <div className="grid grid-cols-[1fr_80px_30px] gap-0 bg-muted/50 px-3 py-2 text-[13px] font-medium text-muted-foreground">
                  <span>품목</span>
                  <span className="text-right">출하수량</span>
                  <span></span>
                </div>

                {fields.map((field, index) => {
                  const soItem = selectedOrder?.items.find(
                    (i) => i.id === field.salesOrderItemId
                  )
                  const maxQty = soItem
                    ? Number(soItem.qty) - Number(soItem.shippedQty)
                    : undefined

                  return (
                    <div
                      key={field.id}
                      className="grid grid-cols-[1fr_80px_30px] gap-0 items-start px-3 py-2 border-t first:border-t-0 hover:bg-muted/20"
                    >
                      {/* 품목명 */}
                      <div className="pr-2 py-1">
                        <span className="text-[13px] font-medium">
                          [{soItem?.item.code ?? ""}] {soItem?.item.name ?? ""}
                        </span>
                        {maxQty !== undefined && (
                          <p className="text-[12px] text-muted-foreground">
                            잔여 {maxQty.toLocaleString()}
                          </p>
                        )}
                      </div>

                      {/* 수량 */}
                      <FormField
                        control={form.control}
                        name={`items.${index}.qty`}
                        render={({ field: f }) => (
                          <FormItem className="pr-2">
                            <Input
                              type="number"
                              min={1}
                              max={maxQty}
                              step={1}
                              className="h-8 text-[13px] text-right"
                              value={f.value ?? ""}
                              onChange={(e) =>
                                f.onChange(
                                  e.target.value === "" ? "" : parseFloat(e.target.value)
                                )
                              }
                            />
                            <FormMessage className="text-[12px]" />
                          </FormItem>
                        )}
                      />

                      {/* 삭제 */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* items 전체 에러 메시지 */}
            <FormField
              control={form.control}
              name="items"
              render={() => (
                <FormItem>
                  <FormMessage className="text-[13px]" />
                </FormItem>
              )}
            />
          </div>
        </div>
      </Form>
    </FormSheet>
  )
}
