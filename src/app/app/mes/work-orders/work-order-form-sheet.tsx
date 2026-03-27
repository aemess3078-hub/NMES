"use client"

import { useState, useEffect } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"

import { Form, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
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
  FormSheet,
  FormTextField,
  FormSelectField,
  FormNumberField,
  FormDateField,
} from "@/components/common/form-sheet"
import { workOrderFormSchema, WorkOrderFormValues } from "./work-order-form-schema"
import {
  createWorkOrder,
  updateWorkOrder,
  generateOrderNo,
  getBomsForItem,
  getRoutingsForItem,
  WorkOrderWithDetails,
} from "@/lib/actions/work-order.actions"
import { WorkOrderStatus } from "@prisma/client"

// ─── Types ────────────────────────────────────────────────────────────────────

type BomOption = { id: string; version: string; isDefault: boolean }
type RoutingOption = {
  id: string
  version: string
  isDefault: boolean
  operations: {
    id: string
    seq: number
    operationCode: string
    name: string
    workCenter: { id: string; code: string; name: string }
  }[]
}

interface WorkOrderFormSheetProps {
  mode: "create" | "edit"
  workOrder?: WorkOrderWithDetails | null
  sites: { id: string; code: string; name: string; type: string }[]
  items: { id: string; code: string; name: string; itemType: string }[]
  equipments: { id: string; code: string; name: string; equipmentType: string }[]
  tenantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_FORM_VALUES: WorkOrderFormValues = {
  siteId: "",
  itemId: "",
  bomId: "",
  routingId: "",
  orderNo: "",
  plannedQty: 1,
  status: WorkOrderStatus.DRAFT,
  dueDate: null,
  productionPlanItemId: null,
  operations: [],
}

const workOrderStatusOptions = [
  { label: "초안", value: WorkOrderStatus.DRAFT },
  { label: "릴리즈", value: WorkOrderStatus.RELEASED },
]

const itemTypeLabels: Record<string, string> = {
  RAW_MATERIAL: "원자재",
  SEMI_FINISHED: "반제품",
  FINISHED: "완제품",
  CONSUMABLE: "소모품",
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkOrderFormSheet({
  mode,
  workOrder,
  sites,
  items,
  equipments,
  tenantId,
  open,
  onOpenChange,
}: WorkOrderFormSheetProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [boms, setBoms] = useState<BomOption[]>([])
  const [routings, setRoutings] = useState<RoutingOption[]>([])
  const [loadingBoms, setLoadingBoms] = useState(false)
  const router = useRouter()

  const form = useForm<WorkOrderFormValues>({
    resolver: zodResolver(workOrderFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  })

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "operations",
  })

  // ─── create 모드 초기화 ──────────────────────────────────────────────────────

  useEffect(() => {
    if (mode === "create" && open) {
      form.reset(DEFAULT_FORM_VALUES)
      setBoms([])
      setRoutings([])
      generateOrderNo(tenantId).then((no) => form.setValue("orderNo", no))
    }
  }, [mode, open, tenantId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── edit 모드 초기화 ────────────────────────────────────────────────────────

  useEffect(() => {
    if (mode === "edit" && workOrder && open) {
      // BOM/라우팅 목록 로딩 (해당 품목 기준)
      setLoadingBoms(true)
      Promise.all([
        getBomsForItem(workOrder.itemId),
        getRoutingsForItem(workOrder.itemId),
      ]).then(([newBoms, newRoutings]) => {
        setBoms(newBoms)
        setRoutings(newRoutings as RoutingOption[])
        setLoadingBoms(false)
      })

      form.reset({
        siteId: workOrder.siteId,
        itemId: workOrder.itemId,
        bomId: workOrder.bomId,
        routingId: workOrder.routingId,
        orderNo: workOrder.orderNo,
        plannedQty: Number(workOrder.plannedQty),
        status: workOrder.status,
        dueDate: workOrder.dueDate
          ? new Date(workOrder.dueDate).toISOString().split("T")[0]
          : null,
        productionPlanItemId: workOrder.productionPlanItemId ?? null,
        operations: workOrder.operations.map((op) => ({
          routingOperationId: op.routingOperationId,
          equipmentId: op.equipmentId ?? null,
          seq: op.seq,
          plannedQty: Number(op.plannedQty),
        })),
      })
    }
  }, [mode, workOrder, open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 품목 변경 핸들러 (BOM/라우팅 연쇄 로딩) ────────────────────────────────

  const handleItemChange = async (itemId: string) => {
    form.setValue("itemId", itemId)
    form.setValue("bomId", "")
    form.setValue("routingId", "")
    replace([])

    if (!itemId) {
      setBoms([])
      setRoutings([])
      return
    }

    setLoadingBoms(true)
    try {
      const [newBoms, newRoutings] = await Promise.all([
        getBomsForItem(itemId),
        getRoutingsForItem(itemId),
      ])
      setBoms(newBoms)
      setRoutings(newRoutings as RoutingOption[])
    } finally {
      setLoadingBoms(false)
    }
  }

  // ─── 라우팅 변경 핸들러 (Operations 자동 채움) ──────────────────────────────

  const handleRoutingChange = (routingId: string) => {
    form.setValue("routingId", routingId)
    const routing = routings.find((r) => r.id === routingId)
    if (routing?.operations && routing.operations.length > 0) {
      const plannedQty = form.getValues("plannedQty") || 1
      replace(
        routing.operations.map((op) => ({
          routingOperationId: op.id,
          equipmentId: null,
          seq: op.seq,
          plannedQty: plannedQty,
        }))
      )
    } else {
      replace([])
    }
  }

  // ─── 저장 핸들러 ────────────────────────────────────────────────────────────

  async function onSubmit(values: WorkOrderFormValues) {
    setIsLoading(true)
    try {
      if (mode === "create") {
        await createWorkOrder(values, tenantId)
      } else if (workOrder) {
        await updateWorkOrder(workOrder.id, values)
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

  // ─── 현재 선택된 라우팅의 공정 목록 ─────────────────────────────────────────

  const selectedRoutingId = form.watch("routingId")
  const selectedRouting = routings.find((r) => r.id === selectedRoutingId)
  const availableOperations = selectedRouting?.operations ?? []

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      title={mode === "create" ? "작업지시 등록" : "작업지시 수정"}
      description={
        mode === "create"
          ? "새로운 작업지시를 등록합니다."
          : "작업지시 정보를 수정합니다."
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
              <FormTextField
                control={form.control}
                name="orderNo"
                label="작업지시번호"
                placeholder="WO-2026-001"
              />

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
            </div>

            {/* 품목 (전체 너비) */}
            <FormField
              control={form.control}
              name="itemId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>품목</FormLabel>
                  <Select
                    onValueChange={(val) => handleItemChange(val)}
                    value={field.value ?? undefined}
                    disabled={mode === "edit"}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="완제품 또는 반제품 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {items.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          [{item.code}] {item.name} ({itemTypeLabels[item.itemType] ?? item.itemType})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              {/* BOM */}
              <FormField
                control={form.control}
                name="bomId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>BOM</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? undefined}
                      disabled={!form.watch("itemId") || loadingBoms}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingBoms ? "로딩 중..." : "BOM 선택"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {boms.map((bom) => (
                          <SelectItem key={bom.id} value={bom.id}>
                            {bom.version}
                            {bom.isDefault ? " (기본)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 라우팅 */}
              <FormField
                control={form.control}
                name="routingId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>라우팅</FormLabel>
                    <Select
                      onValueChange={(val) => handleRoutingChange(val)}
                      value={field.value ?? undefined}
                      disabled={!form.watch("itemId") || loadingBoms}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingBoms ? "로딩 중..." : "라우팅 선택"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {routings.map((routing) => (
                          <SelectItem key={routing.id} value={routing.id}>
                            {routing.version}
                            {routing.isDefault ? " (기본)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormNumberField
                control={form.control}
                name="plannedQty"
                label="계획수량"
                placeholder="0"
                min={1}
                step={1}
              />

              <FormSelectField
                control={form.control}
                name="status"
                label="상태"
                options={workOrderStatusOptions}
              />
            </div>

            <FormDateField
              control={form.control}
              name="dueDate"
              label="납기일"
            />
          </div>

          {/* 공정 목록 */}
          <div className="pt-4 border-t space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-medium text-foreground">공정 목록</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({
                    routingOperationId: "",
                    equipmentId: null,
                    seq: fields.length + 1,
                    plannedQty: form.getValues("plannedQty") || 1,
                  })
                }
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                공정 추가
              </Button>
            </div>

            {fields.length > 0 && (
              <div className="rounded-md border overflow-hidden">
                {/* 헤더 */}
                <div className="grid grid-cols-[36px_1fr_80px_40px] gap-0 bg-muted/50 px-3 py-2 text-[13px] font-medium text-muted-foreground">
                  <span>순서</span>
                  <span>공정</span>
                  <span className="text-right">계획수량</span>
                  <span></span>
                </div>

                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="grid grid-cols-[36px_1fr_80px_40px] gap-0 items-center px-3 py-2 border-t first:border-t-0 hover:bg-muted/20"
                  >
                    {/* 순서 */}
                    <span className="text-[13px] text-muted-foreground">
                      {field.seq}
                    </span>

                    {/* 공정 선택 */}
                    <FormField
                      control={form.control}
                      name={`operations.${index}.routingOperationId`}
                      render={({ field: f }) => (
                        <FormItem className="pr-2">
                          <Select
                            onValueChange={f.onChange}
                            value={f.value ?? undefined}
                          >
                            <SelectTrigger className="h-8 text-[13px]">
                              <SelectValue placeholder="공정 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableOperations.map((op) => (
                                <SelectItem
                                  key={op.id}
                                  value={op.id}
                                  className="text-[13px]"
                                >
                                  {op.seq}. {op.name}
                                </SelectItem>
                              ))}
                              {/* edit 모드에서 라우팅 공정 목록이 없을 때 현재 값 표시 */}
                              {availableOperations.length === 0 && f.value && (
                                <SelectItem
                                  value={f.value}
                                  className="text-[13px]"
                                >
                                  {workOrder?.operations[index]?.routingOperation.name ?? f.value}
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage className="text-[12px]" />
                        </FormItem>
                      )}
                    />

                    {/* 계획수량 */}
                    <FormField
                      control={form.control}
                      name={`operations.${index}.plannedQty`}
                      render={({ field: f }) => (
                        <FormItem className="pr-2">
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
                ))}
              </div>
            )}

            {fields.length === 0 && (
              <div className="rounded-md border border-dashed py-8 text-center text-[14px] text-muted-foreground">
                라우팅을 선택하거나 공정을 직접 추가하세요.
              </div>
            )}

            {/* 설비 배정 섹션 (공정별 설비 선택) */}
            {fields.length > 0 && equipments.length > 0 && (
              <div className="space-y-2">
                <p className="text-[13px] text-muted-foreground">설비 배정 (선택)</p>
                <div className="rounded-md border overflow-hidden">
                  <div className="grid grid-cols-[36px_1fr_1fr] gap-0 bg-muted/50 px-3 py-2 text-[13px] font-medium text-muted-foreground">
                    <span>순서</span>
                    <span>공정</span>
                    <span>설비</span>
                  </div>
                  {fields.map((field, index) => {
                    const opId = form.watch(`operations.${index}.routingOperationId`)
                    const opName =
                      availableOperations.find((op) => op.id === opId)?.name ??
                      workOrder?.operations[index]?.routingOperation.name ??
                      "-"
                    return (
                      <div
                        key={`equip-${field.id}`}
                        className="grid grid-cols-[36px_1fr_1fr] gap-0 items-center px-3 py-2 border-t first:border-t-0 hover:bg-muted/20"
                      >
                        <span className="text-[13px] text-muted-foreground">
                          {field.seq}
                        </span>
                        <span className="text-[13px] pr-2 truncate">{opName}</span>
                        <FormField
                          control={form.control}
                          name={`operations.${index}.equipmentId`}
                          render={({ field: f }) => (
                            <FormItem>
                              <Select
                                onValueChange={(val) =>
                                  f.onChange(val === "__none__" ? null : val)
                                }
                                value={f.value ?? "__none__"}
                              >
                                <SelectTrigger className="h-8 text-[13px]">
                                  <SelectValue placeholder="설비 없음" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__" className="text-[13px]">
                                    설비 없음
                                  </SelectItem>
                                  {equipments.map((eq) => (
                                    <SelectItem
                                      key={eq.id}
                                      value={eq.id}
                                      className="text-[13px]"
                                    >
                                      [{eq.code}] {eq.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* operations 전체 에러 메시지 */}
            <FormField
              control={form.control}
              name="operations"
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
