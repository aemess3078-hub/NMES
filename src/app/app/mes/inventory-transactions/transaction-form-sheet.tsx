"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { TransactionType } from "@prisma/client"

import { Form, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  FormSheet,
  FormTextField,
} from "@/components/common/form-sheet"
import { transactionFormSchema, TransactionFormValues } from "./transaction-form-schema"
import { createTransaction, getLocations } from "@/lib/actions/inventory.actions"

// ─── Types ────────────────────────────────────────────────────────────────────

type LocationOption = { id: string; code: string; name: string; locationType: string | null }

interface TransactionFormSheetProps {
  sites: { id: string; code: string; name: string }[]
  warehouses: { id: string; code: string; name: string; siteId: string }[]
  items: { id: string; code: string; name: string; itemType: string; uom: string }[]
  tenantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TX_TYPE_OPTIONS = [
  { label: "입고 (RECEIPT)", value: TransactionType.RECEIPT },
  { label: "출고 (ISSUE)", value: TransactionType.ISSUE },
  { label: "이동 (TRANSFER)", value: TransactionType.TRANSFER },
  { label: "재고조정 (ADJUST)", value: TransactionType.ADJUST },
  { label: "반품 (RETURN)", value: TransactionType.RETURN },
  { label: "폐기 (SCRAP)", value: TransactionType.SCRAP },
]

const ITEM_TYPE_LABELS: Record<string, string> = {
  RAW_MATERIAL: "원자재",
  SEMI_FINISHED: "반제품",
  FINISHED: "완제품",
  CONSUMABLE: "소모품",
}

const DEFAULT_VALUES: TransactionFormValues = {
  siteId: "",
  fromLocationId: null,
  toLocationId: null,
  itemId: "",
  lotId: null,
  txType: "",
  qty: 1,
  refType: null,
  note: null,
}

// ─── 유형별 로케이션 요건 ─────────────────────────────────────────────────────

function needsFromLocation(txType: string) {
  return ["ISSUE", "SCRAP", "TRANSFER"].includes(txType)
}

function needsToLocation(txType: string) {
  return ["RECEIPT", "RETURN", "TRANSFER"].includes(txType)
}

function needsAdjustLocation(txType: string) {
  return txType === "ADJUST"
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TransactionFormSheet({
  sites,
  warehouses,
  items,
  tenantId,
  open,
  onOpenChange,
}: TransactionFormSheetProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  // 창고별 로케이션 목록 (출발/도착 각각)
  const [fromWarehouseId, setFromWarehouseId] = useState<string>("")
  const [toWarehouseId, setToWarehouseId] = useState<string>("")
  const [adjustWarehouseId, setAdjustWarehouseId] = useState<string>("")

  const [fromLocations, setFromLocations] = useState<LocationOption[]>([])
  const [toLocations, setToLocations] = useState<LocationOption[]>([])
  const [adjustLocations, setAdjustLocations] = useState<LocationOption[]>([])

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: DEFAULT_VALUES,
  })

  const txType = form.watch("txType")
  const selectedSiteId = form.watch("siteId")

  // open 시 폼 초기화
  useEffect(() => {
    if (open) {
      form.reset(DEFAULT_VALUES)
      setFromWarehouseId("")
      setToWarehouseId("")
      setAdjustWarehouseId("")
      setFromLocations([])
      setToLocations([])
      setAdjustLocations([])
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // 출발 창고 변경 → 로케이션 로딩
  const handleFromWarehouseChange = async (warehouseId: string) => {
    setFromWarehouseId(warehouseId)
    form.setValue("fromLocationId", null)
    if (warehouseId) {
      const locs = await getLocations(warehouseId)
      setFromLocations(locs)
    } else {
      setFromLocations([])
    }
  }

  // 도착 창고 변경 → 로케이션 로딩
  const handleToWarehouseChange = async (warehouseId: string) => {
    setToWarehouseId(warehouseId)
    form.setValue("toLocationId", null)
    if (warehouseId) {
      const locs = await getLocations(warehouseId)
      setToLocations(locs)
    } else {
      setToLocations([])
    }
  }

  // 조정 창고 변경 → 로케이션 로딩 (ADJUST용)
  const handleAdjustWarehouseChange = async (warehouseId: string) => {
    setAdjustWarehouseId(warehouseId)
    form.setValue("fromLocationId", null)
    if (warehouseId) {
      const locs = await getLocations(warehouseId)
      setAdjustLocations(locs)
    } else {
      setAdjustLocations([])
    }
  }

  // 유형 변경 시 로케이션 필드 초기화
  const handleTxTypeChange = (value: string) => {
    form.setValue("txType", value)
    form.setValue("fromLocationId", null)
    form.setValue("toLocationId", null)
    setFromWarehouseId("")
    setToWarehouseId("")
    setAdjustWarehouseId("")
    setFromLocations([])
    setToLocations([])
    setAdjustLocations([])
  }

  // 사이트에 속한 창고 필터링
  const filteredWarehouses = selectedSiteId
    ? warehouses.filter((w) => w.siteId === selectedSiteId)
    : warehouses

  const onSubmit = async (values: TransactionFormValues) => {
    setIsLoading(true)
    try {
      await createTransaction(
        {
          siteId: values.siteId,
          fromLocationId: values.fromLocationId,
          toLocationId: values.toLocationId,
          itemId: values.itemId,
          lotId: values.lotId,
          txType: values.txType as TransactionType,
          qty: values.qty,
          refType: values.refType,
          note: values.note,
        },
        tenantId
      )
      router.refresh()
      onOpenChange(false)
    } catch (error) {
      console.error("저장 실패:", error)
      alert(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.")
    } finally {
      setIsLoading(false)
    }
  }

  const qtyLabel =
    txType === "ADJUST" ? "조정 후 수량" : "수량"

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      title="입출고 트랜잭션 등록"
      description="재고 입고, 출고, 이동, 조정 등의 트랜잭션을 등록합니다."
      isLoading={isLoading}
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <Form {...form}>
        <div className="space-y-6">
          {/* 기본 정보 */}
          <div className="space-y-4">
            <p className="text-[15px] font-medium text-foreground">기본 정보</p>

            <div className="grid grid-cols-2 gap-4">
              {/* 유형 */}
              <FormField
                control={form.control}
                name="txType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>트랜잭션 유형</FormLabel>
                    <Select
                      onValueChange={handleTxTypeChange}
                      value={field.value || undefined}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="유형 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {TX_TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 사이트 */}
              <FormField
                control={form.control}
                name="siteId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>사이트</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <SelectTrigger>
                        <SelectValue placeholder="사이트 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {sites.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            [{s.code}] {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* 품목 */}
            <FormField
              control={form.control}
              name="itemId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>품목</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || undefined}>
                    <SelectTrigger>
                      <SelectValue placeholder="품목 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {items.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          [{item.code}] {item.name} ({ITEM_TYPE_LABELS[item.itemType] ?? item.itemType} / {item.uom})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              {/* 수량 */}
              <FormField
                control={form.control}
                name="qty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{qtyLabel}</FormLabel>
                    <Input
                      type="number"
                      min={txType === "ADJUST" ? 0 : 0.001}
                      step="any"
                      placeholder="0"
                      value={field.value ?? ""}
                      onChange={(e) => {
                        const val = e.target.value
                        field.onChange(val === "" ? "" : parseFloat(val))
                      }}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* LOT ID */}
              <FormTextField
                control={form.control}
                name="lotId"
                label="LOT ID (선택)"
                placeholder="LOT 번호 입력"
              />
            </div>

            {/* 참조유형 */}
            <FormTextField
              control={form.control}
              name="refType"
              label="참조유형 (선택)"
              placeholder="예: PO, WO, MR"
            />
          </div>

          {/* 로케이션 정보 */}
          {txType && (
            <div className="pt-4 border-t space-y-4">
              <p className="text-[15px] font-medium text-foreground">로케이션 정보</p>

              {/* RECEIPT / RETURN: 도착 창고 + 로케이션 */}
              {(txType === "RECEIPT" || txType === "RETURN") && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormItem>
                      <FormLabel>입고 창고</FormLabel>
                      <Select
                        onValueChange={handleToWarehouseChange}
                        value={toWarehouseId || undefined}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="창고 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredWarehouses.map((w) => (
                            <SelectItem key={w.id} value={w.id}>
                              [{w.code}] {w.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>

                    <FormField
                      control={form.control}
                      name="toLocationId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>입고 로케이션</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value || undefined}
                            disabled={!toWarehouseId}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={toWarehouseId ? "로케이션 선택" : "창고를 먼저 선택"} />
                            </SelectTrigger>
                            <SelectContent>
                              {toLocations.map((loc) => (
                                <SelectItem key={loc.id} value={loc.id}>
                                  [{loc.code}] {loc.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}

              {/* ISSUE / SCRAP: 출발 창고 + 로케이션 */}
              {(txType === "ISSUE" || txType === "SCRAP") && (
                <div className="grid grid-cols-2 gap-4">
                  <FormItem>
                    <FormLabel>출고 창고</FormLabel>
                    <Select
                      onValueChange={handleFromWarehouseChange}
                      value={fromWarehouseId || undefined}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="창고 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredWarehouses.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            [{w.code}] {w.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>

                  <FormField
                    control={form.control}
                    name="fromLocationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>출고 로케이션</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || undefined}
                          disabled={!fromWarehouseId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={fromWarehouseId ? "로케이션 선택" : "창고를 먼저 선택"} />
                          </SelectTrigger>
                          <SelectContent>
                            {fromLocations.map((loc) => (
                              <SelectItem key={loc.id} value={loc.id}>
                                [{loc.code}] {loc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* ADJUST: 조정 창고 + 로케이션 */}
              {txType === "ADJUST" && (
                <div className="grid grid-cols-2 gap-4">
                  <FormItem>
                    <FormLabel>조정 창고</FormLabel>
                    <Select
                      onValueChange={handleAdjustWarehouseChange}
                      value={adjustWarehouseId || undefined}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="창고 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredWarehouses.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            [{w.code}] {w.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>

                  <FormField
                    control={form.control}
                    name="fromLocationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>조정 로케이션</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || undefined}
                          disabled={!adjustWarehouseId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={adjustWarehouseId ? "로케이션 선택" : "창고를 먼저 선택"} />
                          </SelectTrigger>
                          <SelectContent>
                            {adjustLocations.map((loc) => (
                              <SelectItem key={loc.id} value={loc.id}>
                                [{loc.code}] {loc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* TRANSFER: 출발 창고/로케이션 + 도착 창고/로케이션 */}
              {txType === "TRANSFER" && (
                <div className="space-y-4">
                  <div>
                    <p className="text-[13px] text-muted-foreground mb-3">출발지</p>
                    <div className="grid grid-cols-2 gap-4">
                      <FormItem>
                        <FormLabel>출발 창고</FormLabel>
                        <Select
                          onValueChange={handleFromWarehouseChange}
                          value={fromWarehouseId || undefined}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="창고 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredWarehouses.map((w) => (
                              <SelectItem key={w.id} value={w.id}>
                                [{w.code}] {w.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>

                      <FormField
                        control={form.control}
                        name="fromLocationId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>출발 로케이션</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value || undefined}
                              disabled={!fromWarehouseId}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={fromWarehouseId ? "로케이션 선택" : "창고를 먼저 선택"} />
                              </SelectTrigger>
                              <SelectContent>
                                {fromLocations.map((loc) => (
                                  <SelectItem key={loc.id} value={loc.id}>
                                    [{loc.code}] {loc.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div>
                    <p className="text-[13px] text-muted-foreground mb-3">도착지</p>
                    <div className="grid grid-cols-2 gap-4">
                      <FormItem>
                        <FormLabel>도착 창고</FormLabel>
                        <Select
                          onValueChange={handleToWarehouseChange}
                          value={toWarehouseId || undefined}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="창고 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredWarehouses.map((w) => (
                              <SelectItem key={w.id} value={w.id}>
                                [{w.code}] {w.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>

                      <FormField
                        control={form.control}
                        name="toLocationId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>도착 로케이션</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value || undefined}
                              disabled={!toWarehouseId}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={toWarehouseId ? "로케이션 선택" : "창고를 먼저 선택"} />
                              </SelectTrigger>
                              <SelectContent>
                                {toLocations.map((loc) => (
                                  <SelectItem key={loc.id} value={loc.id}>
                                    [{loc.code}] {loc.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 비고 */}
          <div className="pt-4 border-t space-y-3">
            <p className="text-[15px] font-medium text-foreground">비고</p>
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>비고 (선택)</FormLabel>
                  <Textarea
                    placeholder="추가 메모 입력"
                    className="resize-none"
                    rows={3}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      </Form>
    </FormSheet>
  )
}
