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
import {
  FormSheet,
  FormTextField,
} from "@/components/common/form-sheet"
import { transactionFormSchema, TransactionFormValues } from "./transaction-form-schema"
import { createTransaction, getItemsForSite } from "@/lib/actions/inventory.actions"

// ─── Types ────────────────────────────────────────────────────────────────────

type LocationOption = { id: string; code: string; name: string }
type SiteItem = { id: string; code: string; name: string; itemType: string; uom: string; qtyOnHand: number }

interface TransactionFormSheetProps {
  sites: { id: string; code: string; name: string }[]
  locations: LocationOption[]
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

// ─── Component ────────────────────────────────────────────────────────────────

export function TransactionFormSheet({
  sites,
  locations,
  tenantId,
  open,
  onOpenChange,
}: TransactionFormSheetProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [siteItems, setSiteItems] = useState<SiteItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: DEFAULT_VALUES,
  })

  const txType = form.watch("txType")

  useEffect(() => {
    if (open) {
      form.reset(DEFAULT_VALUES)
      setSiteItems([])
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSiteChange = async (siteId: string) => {
    form.setValue("siteId", siteId)
    form.setValue("itemId", "")
    setSiteItems([])
    setItemsLoading(true)
    try {
      const result = await getItemsForSite(siteId)
      setSiteItems(result)
    } finally {
      setItemsLoading(false)
    }
  }

  const handleTxTypeChange = (value: string) => {
    form.setValue("txType", value)
    form.setValue("fromLocationId", null)
    form.setValue("toLocationId", null)
  }

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
                    <Select onValueChange={handleSiteChange} value={field.value || undefined}>
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
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || undefined}
                    disabled={!form.watch("siteId") || itemsLoading}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          !form.watch("siteId")
                            ? "사이트를 먼저 선택하세요"
                            : itemsLoading
                            ? "품목 불러오는 중..."
                            : siteItems.length === 0
                            ? "해당 사이트에 재고 없음"
                            : "품목 선택"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {siteItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          <div className="flex items-center justify-between gap-4 w-full">
                            <span>[{item.code}] {item.name} ({ITEM_TYPE_LABELS[item.itemType] ?? item.itemType} / {item.uom})</span>
                            <span className="text-muted-foreground text-[12px] shrink-0">재고 {item.qtyOnHand.toLocaleString()}</span>
                          </div>
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

              {/* RECEIPT / RETURN: 입고 로케이션 */}
              {(txType === "RECEIPT" || txType === "RETURN") && (
                <FormField
                  control={form.control}
                  name="toLocationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>입고 로케이션</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <SelectTrigger>
                          <SelectValue placeholder="로케이션 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {locations.map((loc) => (
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
              )}

              {/* ISSUE / SCRAP: 출고 로케이션 */}
              {(txType === "ISSUE" || txType === "SCRAP") && (
                <FormField
                  control={form.control}
                  name="fromLocationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>출고 로케이션</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <SelectTrigger>
                          <SelectValue placeholder="로케이션 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {locations.map((loc) => (
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
              )}

              {/* ADJUST: 조정 로케이션 */}
              {txType === "ADJUST" && (
                <FormField
                  control={form.control}
                  name="fromLocationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>조정 로케이션</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <SelectTrigger>
                          <SelectValue placeholder="로케이션 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {locations.map((loc) => (
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
              )}

              {/* TRANSFER: 출발 로케이션 + 도착 로케이션 */}
              {txType === "TRANSFER" && (
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="fromLocationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>출발 로케이션</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <SelectTrigger>
                            <SelectValue placeholder="로케이션 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {locations.map((loc) => (
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

                  <FormField
                    control={form.control}
                    name="toLocationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>도착 로케이션</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <SelectTrigger>
                            <SelectValue placeholder="로케이션 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {locations.map((loc) => (
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

              {/* 상세 구역 (선택) */}
              <FormTextField
                control={form.control}
                name="note"
                label="상세 구역 (선택)"
                placeholder="예: 3번 랙 A열, 냉동창고 B구역"
              />
            </div>
          )}
        </div>
      </Form>
    </FormSheet>
  )
}
