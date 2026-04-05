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
import {
  createTransaction,
  getItemsForSite,
  getSalesOrdersForSite,
  getWorkOrdersForSite,
} from "@/lib/actions/inventory.actions"

// ─── Types ────────────────────────────────────────────────────────────────────

type WarehouseOption = { id: string; code: string; name: string; siteId: string }
type SiteItem = { id: string; code: string; name: string; itemType: string; uom: string; qtyOnHand: number }
type SalesOrderOption = { id: string; orderNo: string; customer: { name: string } }
type WorkOrderOption = { id: string; orderNo: string; item: { name: string }; status: string }

interface TransactionFormSheetProps {
  sites: { id: string; code: string; name: string }[]
  locations: WarehouseOption[]
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

const ISSUE_DEST_OPTIONS = [
  { label: "고객사 출하 (수주)", value: "SO" },
  { label: "생산 투입 (작업지시)", value: "WO" },
  { label: "기타", value: "OTHER" },
]

const DEFAULT_VALUES: TransactionFormValues = {
  siteId: "",
  fromLocationId: null,
  toLocationId: null,
  itemId: "",
  lotId: null,
  txType: "",
  qty: 1,
  refType: null,
  refId: null,
  issueDestType: null,
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
  const [salesOrders, setSalesOrders] = useState<SalesOrderOption[]>([])
  const [workOrders, setWorkOrders] = useState<WorkOrderOption[]>([])

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: DEFAULT_VALUES,
  })

  const txType = form.watch("txType")
  const siteId = form.watch("siteId")
  const issueDestType = form.watch("issueDestType")

  // 사이트 필터링된 창고 목록
  const siteLocations = siteId
    ? locations.filter((loc) => loc.siteId === siteId)
    : []

  useEffect(() => {
    if (open) {
      form.reset(DEFAULT_VALUES)
      setSiteItems([])
      setSalesOrders([])
      setWorkOrders([])
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSiteChange = async (newSiteId: string) => {
    form.setValue("siteId", newSiteId)
    form.setValue("itemId", "")
    form.setValue("fromLocationId", null)
    form.setValue("toLocationId", null)
    form.setValue("refId", null)
    setSiteItems([])
    setSalesOrders([])
    setWorkOrders([])
    setItemsLoading(true)
    try {
      const [items, sos, wos] = await Promise.all([
        getItemsForSite(newSiteId),
        getSalesOrdersForSite(newSiteId),
        getWorkOrdersForSite(newSiteId),
      ])
      setSiteItems(items)
      setSalesOrders(sos)
      setWorkOrders(wos)
    } finally {
      setItemsLoading(false)
    }
  }

  const handleTxTypeChange = (value: string) => {
    form.setValue("txType", value)
    form.setValue("fromLocationId", null)
    form.setValue("toLocationId", null)
    form.setValue("issueDestType", null)
    form.setValue("refType", null)
    form.setValue("refId", null)
  }

  const handleIssueDestTypeChange = (value: string) => {
    form.setValue("issueDestType", value as "SO" | "WO" | "OTHER")
    form.setValue("refType", value === "OTHER" ? null : value)
    form.setValue("refId", null)
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
          refId: values.refId,
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

  const qtyLabel = txType === "ADJUST" ? "조정 후 수량" : "수량"

  const locationPlaceholder = siteId ? "창고 선택" : "사이트를 먼저 선택하세요"

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
                    disabled={!siteId || itemsLoading}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          !siteId
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
          </div>

          {/* 로케이션 정보 */}
          {txType && (
            <div className="pt-4 border-t space-y-4">
              <p className="text-[15px] font-medium text-foreground">로케이션 정보</p>

              {/* RECEIPT / RETURN: 입고 창고 */}
              {(txType === "RECEIPT" || txType === "RETURN") && (
                <FormField
                  control={form.control}
                  name="toLocationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>입고 창고</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || undefined}
                        disabled={!siteId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={locationPlaceholder} />
                        </SelectTrigger>
                        <SelectContent>
                          {siteLocations.map((loc) => (
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

              {/* ISSUE: 출고 창고 + 출고 목적지 */}
              {txType === "ISSUE" && (
                <>
                  <FormField
                    control={form.control}
                    name="fromLocationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>출고 창고</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || undefined}
                          disabled={!siteId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={locationPlaceholder} />
                          </SelectTrigger>
                          <SelectContent>
                            {siteLocations.map((loc) => (
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

                  {/* 출고 목적지 */}
                  <div className="pt-2 border-t space-y-3">
                    <p className="text-[14px] font-medium text-foreground">출고 목적지</p>

                    <FormField
                      control={form.control}
                      name="issueDestType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>목적 유형</FormLabel>
                          <Select
                            onValueChange={handleIssueDestTypeChange}
                            value={field.value || undefined}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="목적 유형 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              {ISSUE_DEST_OPTIONS.map((opt) => (
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

                    {/* 고객사 출하 → 수주 선택 */}
                    {issueDestType === "SO" && (
                      <FormField
                        control={form.control}
                        name="refId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>수주</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value || undefined}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={salesOrders.length === 0 ? "해당 사이트에 진행 중인 수주 없음" : "수주 선택"} />
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
                    )}

                    {/* 생산 투입 → 작업지시 선택 */}
                    {issueDestType === "WO" && (
                      <FormField
                        control={form.control}
                        name="refId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>작업지시</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value || undefined}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={workOrders.length === 0 ? "해당 사이트에 진행 중인 작업지시 없음" : "작업지시 선택"} />
                              </SelectTrigger>
                              <SelectContent>
                                {workOrders.map((wo) => (
                                  <SelectItem key={wo.id} value={wo.id}>
                                    {wo.orderNo} — {wo.item.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* 기타 → 자유 텍스트 */}
                    {issueDestType === "OTHER" && (
                      <FormTextField
                        control={form.control}
                        name="note"
                        label="출고 목적지 (직접 입력)"
                        placeholder="예: 외주업체, 전시 샘플, 연구소 등"
                      />
                    )}
                  </div>
                </>
              )}

              {/* SCRAP: 폐기 창고 */}
              {txType === "SCRAP" && (
                <FormField
                  control={form.control}
                  name="fromLocationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>폐기 창고</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || undefined}
                        disabled={!siteId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={locationPlaceholder} />
                        </SelectTrigger>
                        <SelectContent>
                          {siteLocations.map((loc) => (
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

              {/* ADJUST: 조정 창고 */}
              {txType === "ADJUST" && (
                <FormField
                  control={form.control}
                  name="fromLocationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>조정 창고</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || undefined}
                        disabled={!siteId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={locationPlaceholder} />
                        </SelectTrigger>
                        <SelectContent>
                          {siteLocations.map((loc) => (
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

              {/* TRANSFER: 출발 창고 + 도착 창고 */}
              {txType === "TRANSFER" && (
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="fromLocationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>출발 창고</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || undefined}
                          disabled={!siteId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={locationPlaceholder} />
                          </SelectTrigger>
                          <SelectContent>
                            {siteLocations.map((loc) => (
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
                        <FormLabel>도착 창고</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || undefined}
                          disabled={!siteId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={locationPlaceholder} />
                          </SelectTrigger>
                          <SelectContent>
                            {siteLocations.map((loc) => (
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

              {/* 비고 (ISSUE-OTHER 제외한 경우에만 표시) */}
              {txType !== "ISSUE" && (
                <FormTextField
                  control={form.control}
                  name="note"
                  label="비고 (선택)"
                  placeholder="메모 입력"
                />
              )}
            </div>
          )}
        </div>
      </Form>
    </FormSheet>
  )
}
