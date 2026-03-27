"use client"

import { useState, useEffect } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"

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
import {
  FormSheet,
  FormTextField,
  FormSelectField,
} from "@/components/common/form-sheet"
import { planFormSchema, PlanFormValues } from "./plan-form-schema"
import {
  createPlan,
  updatePlan,
  generatePlanNo,
  getBomsForPlanItem,
  getRoutingsForPlanItem,
  PlanWithDetails,
} from "@/lib/actions/production-plan.actions"
import { PlanType, PlanStatus } from "@prisma/client"

// ─── Types ────────────────────────────────────────────────────────────────────

type BomOption = { id: string; version: string; isDefault: boolean }
type RoutingOption = { id: string; version: string; isDefault: boolean }

interface PlanFormSheetProps {
  mode: "create" | "edit"
  plan?: PlanWithDetails | null
  sites: { id: string; code: string; name: string; type: string }[]
  items: { id: string; code: string; name: string; itemType: string }[]
  tenantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const planTypeOptions = [
  { label: "일간", value: PlanType.DAILY },
  { label: "주간", value: PlanType.WEEKLY },
  { label: "월간", value: PlanType.MONTHLY },
]

const planStatusOptions = [
  { label: "초안", value: PlanStatus.DRAFT },
  { label: "확정", value: PlanStatus.CONFIRMED },
  { label: "진행중", value: PlanStatus.IN_PROGRESS },
  { label: "완료", value: PlanStatus.COMPLETED },
  { label: "취소", value: PlanStatus.CANCELLED },
]

const itemTypeLabels: Record<string, string> = {
  RAW_MATERIAL: "원자재",
  SEMI_FINISHED: "반제품",
  FINISHED: "완제품",
  CONSUMABLE: "소모품",
}

const DEFAULT_ITEM = {
  itemId: "",
  bomId: null,
  routingId: null,
  plannedQty: 1,
  note: "",
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PlanFormSheet({
  mode,
  plan,
  sites,
  items,
  tenantId,
  open,
  onOpenChange,
}: PlanFormSheetProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [rowBoms, setRowBoms] = useState<Record<number, BomOption[]>>({})
  const [rowRoutings, setRowRoutings] = useState<Record<number, RoutingOption[]>>({})
  const router = useRouter()

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: {
      siteId: "",
      planNo: "",
      planType: PlanType.WEEKLY,
      startDate: "",
      endDate: "",
      status: PlanStatus.DRAFT,
      note: "",
      items: [],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  })

  // ─── create 모드 초기화 ──────────────────────────────────────────────────────

  useEffect(() => {
    if (mode === "create" && open) {
      generatePlanNo(tenantId, PlanType.WEEKLY).then((no) => {
        form.reset({
          siteId: "",
          planNo: no,
          planType: PlanType.WEEKLY,
          startDate: "",
          endDate: "",
          status: PlanStatus.DRAFT,
          note: "",
          items: [],
        })
      })
      setRowBoms({})
      setRowRoutings({})
    }
  }, [mode, open, tenantId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── edit 모드 초기화 ────────────────────────────────────────────────────────

  useEffect(() => {
    if (mode === "edit" && plan && open) {
      form.reset({
        siteId: plan.siteId,
        planNo: plan.planNo,
        planType: plan.planType,
        startDate: new Date(plan.startDate).toISOString().split("T")[0],
        endDate: new Date(plan.endDate).toISOString().split("T")[0],
        status: plan.status,
        note: plan.note ?? "",
        items: plan.items.map((item) => ({
          itemId: item.itemId,
          bomId: item.bomId ?? null,
          routingId: item.routingId ?? null,
          plannedQty: Number(item.plannedQty),
          note: item.note ?? "",
        })),
      })

      // 각 행의 BOM/라우팅 로딩
      plan.items.forEach(async (item, index) => {
        const [boms, routings] = await Promise.all([
          getBomsForPlanItem(item.itemId),
          getRoutingsForPlanItem(item.itemId),
        ])
        setRowBoms((prev) => ({ ...prev, [index]: boms }))
        setRowRoutings((prev) => ({ ...prev, [index]: routings }))
      })
    }
  }, [mode, plan, open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 계획유형 변경 시 planNo 자동 갱신 ──────────────────────────────────────

  const handlePlanTypeChange = async (planType: PlanType) => {
    form.setValue("planType", planType)
    if (mode === "create") {
      const newNo = await generatePlanNo(tenantId, planType)
      form.setValue("planNo", newNo)
    }
  }

  // ─── 행별 품목 변경 핸들러 ───────────────────────────────────────────────────

  const handleItemChangeForRow = async (index: number, itemId: string) => {
    form.setValue(`items.${index}.itemId`, itemId)
    form.setValue(`items.${index}.bomId`, null)
    form.setValue(`items.${index}.routingId`, null)

    if (!itemId) {
      setRowBoms((prev) => ({ ...prev, [index]: [] }))
      setRowRoutings((prev) => ({ ...prev, [index]: [] }))
      return
    }

    const [boms, routings] = await Promise.all([
      getBomsForPlanItem(itemId),
      getRoutingsForPlanItem(itemId),
    ])
    setRowBoms((prev) => ({ ...prev, [index]: boms }))
    setRowRoutings((prev) => ({ ...prev, [index]: routings }))
  }

  // ─── 저장 핸들러 ────────────────────────────────────────────────────────────

  async function onSubmit(values: PlanFormValues) {
    setIsLoading(true)
    try {
      if (mode === "create") {
        await createPlan(values, tenantId)
      } else if (plan) {
        await updatePlan(plan.id, values)
      }
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      console.error("저장 실패:", error)
      alert(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.")
    } finally {
      setIsLoading(false)
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      title={mode === "create" ? "생산계획 등록" : "생산계획 수정"}
      description={
        mode === "create"
          ? "새로운 생산계획을 등록합니다."
          : "생산계획 정보를 수정합니다."
      }
      isLoading={isLoading}
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <Form {...form}>
        <div className="space-y-6">
          {/* 헤더 정보 */}
          <div className="space-y-4">
            <p className="text-[15px] font-medium text-foreground">기본 정보</p>

            <div className="grid grid-cols-2 gap-4">
              {/* 계획번호 */}
              <FormTextField
                control={form.control}
                name="planNo"
                label="계획번호"
                placeholder="PP-2026-W13"
              />

              {/* 공장 */}
              <FormSelectField
                control={form.control}
                name="siteId"
                label="공장"
                placeholder="공장 선택"
                options={sites.map((s) => ({
                  label: `[${s.code}] ${s.name}`,
                  value: s.id,
                }))}
              />

              {/* 계획유형 */}
              <FormField
                control={form.control}
                name="planType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>계획유형</FormLabel>
                    <Select
                      onValueChange={(val) => handlePlanTypeChange(val as PlanType)}
                      value={field.value ?? undefined}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="계획유형 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {planTypeOptions.map((opt) => (
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

              {/* 상태 */}
              <FormSelectField
                control={form.control}
                name="status"
                label="상태"
                options={planStatusOptions}
              />

              {/* 시작일 */}
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>시작일</FormLabel>
                    <Input
                      type="date"
                      value={field.value ?? ""}
                      onChange={field.onChange}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 종료일 */}
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>종료일</FormLabel>
                    <Input
                      type="date"
                      value={field.value ?? ""}
                      onChange={field.onChange}
                    />
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
                    placeholder="비고 입력"
                    rows={2}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* 품목 목록 */}
          <div className="pt-4 border-t space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-medium text-foreground">품목 목록</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ ...DEFAULT_ITEM })}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                품목 추가
              </Button>
            </div>

            {fields.length > 0 && (
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[160px]">
                        품목
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[120px]">
                        BOM
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[120px]">
                        라우팅
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground min-w-[80px]">
                        계획수량
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground min-w-[120px]">
                        비고
                      </th>
                      <th className="px-3 py-2 w-[40px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => {
                      const currentItemId = form.watch(`items.${index}.itemId`)
                      const bomsForRow = rowBoms[index] ?? []
                      const routingsForRow = rowRoutings[index] ?? []

                      return (
                        <tr
                          key={field.id}
                          className="border-t first:border-t-0 hover:bg-muted/20"
                        >
                          {/* 품목 */}
                          <td className="px-2 py-1.5">
                            <FormField
                              control={form.control}
                              name={`items.${index}.itemId`}
                              render={({ field: f }) => (
                                <FormItem>
                                  <Select
                                    onValueChange={(val) =>
                                      handleItemChangeForRow(index, val)
                                    }
                                    value={f.value || undefined}
                                  >
                                    <SelectTrigger className="h-8 text-[13px]">
                                      <SelectValue placeholder="품목 선택" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {items.map((item) => (
                                        <SelectItem
                                          key={item.id}
                                          value={item.id}
                                          className="text-[13px]"
                                        >
                                          [{item.code}]{" "}
                                          {item.name} (
                                          {itemTypeLabels[item.itemType] ?? item.itemType}
                                          )
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage className="text-[12px]" />
                                </FormItem>
                              )}
                            />
                          </td>

                          {/* BOM */}
                          <td className="px-2 py-1.5">
                            <FormField
                              control={form.control}
                              name={`items.${index}.bomId`}
                              render={({ field: f }) => (
                                <FormItem>
                                  <Select
                                    onValueChange={(val) =>
                                      f.onChange(val === "__none__" ? null : val)
                                    }
                                    value={f.value ?? "__none__"}
                                    disabled={!currentItemId}
                                  >
                                    <SelectTrigger className="h-8 text-[13px]">
                                      <SelectValue placeholder="BOM 선택" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__" className="text-[13px]">
                                        선택 안함
                                      </SelectItem>
                                      {bomsForRow.map((bom) => (
                                        <SelectItem
                                          key={bom.id}
                                          value={bom.id}
                                          className="text-[13px]"
                                        >
                                          {bom.version}
                                          {bom.isDefault ? " (기본)" : ""}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage className="text-[12px]" />
                                </FormItem>
                              )}
                            />
                          </td>

                          {/* 라우팅 */}
                          <td className="px-2 py-1.5">
                            <FormField
                              control={form.control}
                              name={`items.${index}.routingId`}
                              render={({ field: f }) => (
                                <FormItem>
                                  <Select
                                    onValueChange={(val) =>
                                      f.onChange(val === "__none__" ? null : val)
                                    }
                                    value={f.value ?? "__none__"}
                                    disabled={!currentItemId}
                                  >
                                    <SelectTrigger className="h-8 text-[13px]">
                                      <SelectValue placeholder="라우팅 선택" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__" className="text-[13px]">
                                        선택 안함
                                      </SelectItem>
                                      {routingsForRow.map((routing) => (
                                        <SelectItem
                                          key={routing.id}
                                          value={routing.id}
                                          className="text-[13px]"
                                        >
                                          {routing.version}
                                          {routing.isDefault ? " (기본)" : ""}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage className="text-[12px]" />
                                </FormItem>
                              )}
                            />
                          </td>

                          {/* 계획수량 */}
                          <td className="px-2 py-1.5">
                            <FormField
                              control={form.control}
                              name={`items.${index}.plannedQty`}
                              render={({ field: f }) => (
                                <FormItem>
                                  <Input
                                    type="number"
                                    min={1}
                                    step={1}
                                    className="h-8 text-[13px] text-right"
                                    value={f.value ?? ""}
                                    onChange={(e) => {
                                      const val = e.target.value
                                      f.onChange(val === "" ? "" : parseFloat(val))
                                    }}
                                  />
                                  <FormMessage className="text-[12px]" />
                                </FormItem>
                              )}
                            />
                          </td>

                          {/* 비고 */}
                          <td className="px-2 py-1.5">
                            <FormField
                              control={form.control}
                              name={`items.${index}.note`}
                              render={({ field: f }) => (
                                <FormItem>
                                  <Input
                                    className="h-8 text-[13px]"
                                    placeholder="비고"
                                    value={f.value ?? ""}
                                    onChange={f.onChange}
                                  />
                                  <FormMessage className="text-[12px]" />
                                </FormItem>
                              )}
                            />
                          </td>

                          {/* 삭제 */}
                          <td className="px-2 py-1.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => remove(index)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {fields.length === 0 && (
              <div className="rounded-md border border-dashed py-8 text-center text-[14px] text-muted-foreground">
                품목 추가 버튼을 눌러 계획 품목을 추가하세요.
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
