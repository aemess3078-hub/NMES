"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { Printer, Trash2 } from "lucide-react"

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
import {
  createShipment,
  getAvailableFinishedGoodsLots,
  type AvailableFinishedGoodsLot,
} from "@/lib/actions/shipment.actions"
import { BarcodeScanInput, type ParsedBarcode } from "@/components/common/barcode/barcode-scan-input"
import { BarcodePrintDialog } from "@/components/common/barcode/barcode-print-dialog"

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

const DEFAULT_VALUES: ShipmentFormValues = {
  salesOrderId: "",
  plannedDate: new Date().toISOString().split("T")[0],
  warehouseId: "",
  note: "",
  items: [],
}

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
  const [isLotLoading, setIsLotLoading] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)
  const [availableLotsByItem, setAvailableLotsByItem] = useState<Record<string, AvailableFinishedGoodsLot[]>>({})
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  const router = useRouter()

  const form = useForm<ShipmentFormValues>({
    resolver: zodResolver(shipmentFormSchema),
    defaultValues: DEFAULT_VALUES,
  })

  const { fields, replace, remove } = useFieldArray({
    control: form.control,
    name: "items",
  })

  const selectedOrderId = form.watch("salesOrderId")
  const selectedWarehouseId = form.watch("warehouseId")
  const watchedItems = form.watch("items")
  const selectedOrder = salesOrders.find((so) => so.id === selectedOrderId)
  const watchedItemIdsKey = watchedItems.map((item) => item.itemId).join(",")
  const watchedItemCount = watchedItems.length

  const selectedLotByIndex = useMemo(() => {
    return watchedItems.map((item) => {
      if (!item?.lotId) return null
      return availableLotsByItem[item.itemId]?.find((lot) => lot.lotId === item.lotId) ?? null
    })
  }, [availableLotsByItem, watchedItems])

  useEffect(() => {
    if (!open) return

    const base = {
      ...DEFAULT_VALUES,
      plannedDate: new Date().toISOString().split("T")[0],
    }
    setAvailableLotsByItem({})

    if (defaultSalesOrderId) {
      form.reset({ ...base, salesOrderId: defaultSalesOrderId })
      const selected = salesOrders.find((so) => so.id === defaultSalesOrderId)
      if (selected) replace(toShipmentItems(selected))
    } else {
      form.reset(base)
      replace([])
    }
  }, [open, defaultSalesOrderId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false

    async function loadLots() {
      const currentItems = form.getValues("items")
      if (!open || !selectedWarehouseId || currentItems.length === 0) {
        setAvailableLotsByItem({})
        return
      }

      setIsLotLoading(true)
      try {
        const lots = await getAvailableFinishedGoodsLots(
          tenantId,
          siteId,
          selectedWarehouseId,
          currentItems.map((item) => item.itemId),
        )
        if (!cancelled) setAvailableLotsByItem(lots)
      } catch (error) {
        console.error("LOT 조회 실패:", error)
        if (!cancelled) setAvailableLotsByItem({})
      } finally {
        if (!cancelled) setIsLotLoading(false)
      }
    }

    void loadLots()
    return () => {
      cancelled = true
    }
  }, [form, open, selectedWarehouseId, siteId, tenantId, watchedItemCount, watchedItemIdsKey])

  function toShipmentItems(order: SalesOrderOption): ShipmentFormValues["items"] {
    return order.items
      .filter((item) => Number(item.qty) - Number(item.shippedQty) > 0)
      .map((item) => ({
        salesOrderItemId: item.id,
        itemId: item.itemId,
        qty: Number(item.qty) - Number(item.shippedQty),
        lotId: "",
      }))
  }

  function handleScan(parsed: ParsedBarcode) {
    if (!selectedOrder) {
      alert("먼저 수주를 선택하세요.")
      return
    }
    const idx = fields.findIndex((field) => {
      const soItem = selectedOrder.items.find((item) => item.id === field.salesOrderItemId)
      return soItem?.item.code === parsed.itemCode
    })
    if (idx === -1) {
      alert(`품목 코드 "${parsed.itemCode}"가 현재 출하 품목 목록에 없습니다.`)
      return
    }
    setHighlightedIndex(idx)
    rowRefs.current[idx]?.scrollIntoView({ behavior: "smooth", block: "center" })
    setTimeout(() => setHighlightedIndex(null), 3000)
  }

  function handleSalesOrderChange(salesOrderId: string) {
    form.setValue("salesOrderId", salesOrderId)
    const selected = salesOrders.find((so) => so.id === salesOrderId)
    replace(selected ? toShipmentItems(selected) : [])
  }

  function handleWarehouseChange(warehouseId: string) {
    form.setValue("warehouseId", warehouseId)
    const currentItems = form.getValues("items")
    replace(currentItems.map((item) => ({ ...item, lotId: "" })))
    setAvailableLotsByItem({})
  }

  async function onSubmit(values: ShipmentFormValues) {
    setIsLoading(true)
    try {
      for (let index = 0; index < values.items.length; index++) {
        const item = values.items[index]
        const soItem = selectedOrder?.items.find((row) => row.id === item.salesOrderItemId)
        const remainingQty = soItem ? Number(soItem.qty) - Number(soItem.shippedQty) : 0
        const lot = availableLotsByItem[item.itemId]?.find((row) => row.lotId === item.lotId)
        if (item.qty > remainingQty) {
          throw new Error("출하 수량이 미출하 수량을 초과합니다.")
        }
        if (lot && item.qty > lot.qtyAvailable) {
          throw new Error(`LOT(${lot.lotNo}) 출하 가능 수량을 초과했습니다.`)
        }
      }

      await createShipment(tenantId, siteId, {
        salesOrderId: values.salesOrderId,
        plannedDate: new Date(values.plannedDate),
        warehouseId: values.warehouseId,
        note: values.note,
        items: values.items.map((item) => ({
          salesOrderItemId: item.salesOrderItemId,
          itemId: item.itemId,
          qty: item.qty,
          lotId: item.lotId,
        })),
      })
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      console.error("출하 등록 실패:", error)
      alert(error instanceof Error ? error.message : "출하 등록 중 오류가 발생했습니다.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      title="출하 등록"
      description="수주 기반으로 완제품 LOT를 선택해 출하를 등록합니다."
      isLoading={isLoading}
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <Form {...form}>
        <div className="space-y-6">
          <div className="space-y-4">
            <p className="text-[15px] font-medium text-foreground">기본 정보</p>

            <FormField
              control={form.control}
              name="salesOrderId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>수주</FormLabel>
                  <Select
                    onValueChange={handleSalesOrderChange}
                    value={field.value || undefined}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="출하할 수주 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {salesOrders.map((so) => (
                        <SelectItem key={so.id} value={so.id}>
                          {so.orderNo} · {so.customer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

              <FormField
                control={form.control}
                name="warehouseId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>출하 창고</FormLabel>
                    <Select
                      onValueChange={handleWarehouseChange}
                      value={field.value || undefined}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="출하 창고 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map((warehouse) => (
                          <SelectItem key={warehouse.id} value={warehouse.id}>
                            [{warehouse.code}] {warehouse.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>비고</FormLabel>
                  <Textarea
                    placeholder="비고 사항을 입력하세요"
                    className="h-20 resize-none"
                    {...field}
                    value={field.value ?? ""}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[15px] font-medium text-foreground">출하 품목</p>
                <p className="text-[13px] text-muted-foreground">
                  Phase 2-B에서는 품목별 1개 완제품 LOT 출하를 지원합니다.
                </p>
              </div>
              {fields.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-[13px]"
                  onClick={() => setPrintOpen(true)}
                >
                  <Printer className="h-3.5 w-3.5" />
                  일괄 출력
                </Button>
              )}
            </div>

            {selectedOrderId && fields.length > 0 && (
              <BarcodeScanInput
                onScan={handleScan}
                placeholder="품목 바코드를 스캔하면 해당 행으로 이동합니다"
              />
            )}

            {!selectedOrderId && (
              <div className="rounded-md border border-dashed py-8 text-center text-[14px] text-muted-foreground">
                수주를 선택하면 미출하 품목이 자동으로 로딩됩니다.
              </div>
            )}

            {selectedOrderId && !selectedWarehouseId && fields.length > 0 && (
              <div className="rounded-md border border-dashed py-5 text-center text-[14px] text-muted-foreground">
                출하 창고를 선택하면 가용 완제품 LOT를 조회합니다.
              </div>
            )}

            {selectedOrderId && fields.length === 0 && (
              <div className="rounded-md border border-dashed py-8 text-center text-[14px] text-muted-foreground">
                미출하 품목이 없습니다.
              </div>
            )}

            {fields.length > 0 && (
              <div className="overflow-hidden rounded-md border">
                <div className="grid grid-cols-[1.1fr_1.4fr_90px_34px] gap-0 bg-muted/50 px-3 py-2 text-[13px] font-medium text-muted-foreground">
                  <span>품목</span>
                  <span>완제품 LOT</span>
                  <span className="text-right">출하수량</span>
                  <span />
                </div>

                {fields.map((field, index) => {
                  const soItem = selectedOrder?.items.find((item) => item.id === field.salesOrderItemId)
                  const remainingQty = soItem ? Number(soItem.qty) - Number(soItem.shippedQty) : 0
                  const lots = availableLotsByItem[field.itemId] ?? []
                  const selectedLot = selectedLotByIndex[index]
                  const maxQty = selectedLot ? Math.min(remainingQty, selectedLot.qtyAvailable) : remainingQty

                  return (
                    <div
                      key={field.id}
                      ref={(el) => { rowRefs.current[index] = el }}
                      className={`grid grid-cols-[1.1fr_1.4fr_90px_34px] items-start gap-0 border-t px-3 py-2 transition-colors duration-300 first:border-t-0 ${
                        highlightedIndex === index ? "bg-green-50" : "hover:bg-muted/20"
                      }`}
                    >
                      <div className="pr-3 py-1">
                        <span className="text-[13px] font-medium">
                          [{soItem?.item.code ?? ""}] {soItem?.item.name ?? ""}
                        </span>
                        <p className="text-[13px] text-muted-foreground">
                          미출하 {remainingQty.toLocaleString()}
                        </p>
                      </div>

                      <FormField
                        control={form.control}
                        name={`items.${index}.lotId`}
                        render={({ field: lotField }) => (
                          <FormItem className="pr-2">
                            <Select
                              value={lotField.value || undefined}
                              onValueChange={lotField.onChange}
                              disabled={!selectedWarehouseId || isLotLoading || lots.length === 0}
                            >
                              <SelectTrigger className="h-9 text-[13px]">
                                <SelectValue
                                  placeholder={
                                    !selectedWarehouseId
                                      ? "창고 선택 필요"
                                      : isLotLoading
                                        ? "LOT 조회 중"
                                        : lots.length === 0
                                          ? "가용 LOT 없음"
                                          : "LOT 선택"
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {lots.map((lot) => (
                                  <SelectItem key={lot.lotId} value={lot.lotId}>
                                    {lot.lotNo} · {lot.warehouseName}
                                    {lot.locationName ? ` / ${lot.locationName}` : ""} · 가용 {lot.qtyAvailable.toLocaleString()}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {selectedLot && (
                              <p className="text-[13px] text-muted-foreground">
                                가용 {selectedLot.qtyAvailable.toLocaleString()} · {selectedLot.locationName ?? selectedLot.warehouseName}
                              </p>
                            )}
                            <FormMessage className="text-[12px]" />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`items.${index}.qty`}
                        render={({ field: qtyField }) => (
                          <FormItem className="pr-2">
                            <Input
                              type="number"
                              min={1}
                              max={maxQty}
                              step={1}
                              className="h-9 text-right text-[13px]"
                              value={qtyField.value ?? ""}
                              onChange={(event) => {
                                const next = event.target.value === "" ? "" : parseFloat(event.target.value)
                                if (typeof next === "number" && Number.isFinite(next) && maxQty > 0) {
                                  qtyField.onChange(Math.min(next, maxQty))
                                  return
                                }
                                qtyField.onChange(next)
                              }}
                            />
                            <FormMessage className="text-[12px]" />
                          </FormItem>
                        )}
                      />

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}

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

      <BarcodePrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        title="출하 라벨 출력"
        items={fields.map((field) => {
          const soItem = selectedOrder?.items.find((item) => item.id === field.salesOrderItemId)
          return {
            itemCode: soItem?.item.code ?? "",
            itemName: soItem?.item.name ?? "",
            quantity: field.qty as number,
          }
        })}
      />
    </FormSheet>
  )
}
