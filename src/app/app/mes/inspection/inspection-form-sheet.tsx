"use client"

import { useEffect, useState, useCallback } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Info } from "lucide-react"

import { Form } from "@/components/ui/form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  FormSheet,
  FormSelectField,
  FormNumberField,
} from "@/components/common/form-sheet"
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import {
  inspectionFormSchema,
  InspectionFormValues,
  INSPECTION_RESULT_OPTIONS,
  DEFECT_SEVERITY_OPTIONS,
  DEFECT_DISPOSITION_OPTIONS,
} from "./inspection-form-schema"
import {
  createQualityInspection,
  getInspectionSpecByOperation,
  InspectionSpecWithItems,
  WorkOrderOperationForInspection,
  DefectCodeRow,
} from "@/lib/actions/quality.actions"

// ─── Types ────────────────────────────────────────────────────────────────────

interface InspectionFormSheetProps {
  tenantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  workOrderOperations: WorkOrderOperationForInspection[]
  profiles: { id: string; displayName: string; email: string }[]
  defectCodes: DefectCodeRow[]
}

const now = () => {
  const d = new Date()
  return d.toISOString().slice(0, 16)
}

const DEFAULT_VALUES: InspectionFormValues = {
  workOrderOperationId: "",
  inspectionSpecId: "",
  inspectorId: "",
  result: null,
  inspectedQty: 1,
  inspectedAt: now(),
  defectRecords: [],
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InspectionFormSheet({
  tenantId,
  open,
  onOpenChange,
  workOrderOperations,
  profiles,
  defectCodes,
}: InspectionFormSheetProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [loadingSpec, setLoadingSpec] = useState(false)
  const [resolvedSpec, setResolvedSpec] = useState<InspectionSpecWithItems | null>(null)
  const router = useRouter()

  const form = useForm<InspectionFormValues>({
    resolver: zodResolver(inspectionFormSchema),
    defaultValues: DEFAULT_VALUES,
  })

  const { fields: defectFields, append: appendDefect, remove: removeDefect } =
    useFieldArray({ control: form.control, name: "defectRecords" })

  useEffect(() => {
    if (open) {
      form.reset({ ...DEFAULT_VALUES, inspectedAt: now() })
      setResolvedSpec(null)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // 작업지시 공정 선택 시 → 해당 공정의 활성 검사기준 자동 로드
  const handleOperationChange = useCallback(
    async (operationId: string) => {
      form.setValue("workOrderOperationId", operationId)
      form.setValue("inspectionSpecId", "")
      setResolvedSpec(null)

      if (!operationId) return

      const operation = workOrderOperations.find((op) => op.id === operationId)
      if (!operation) return

      setLoadingSpec(true)
      try {
        const spec = await getInspectionSpecByOperation(
          operation.routingOperationId,
          tenantId
        )
        if (spec) {
          form.setValue("inspectionSpecId", spec.id)
          setResolvedSpec(spec)
        } else {
          form.setValue("inspectionSpecId", "")
        }
      } finally {
        setLoadingSpec(false)
      }
    },
    [workOrderOperations, tenantId, form]
  )

  async function onSubmit(values: InspectionFormValues) {
    setIsLoading(true)
    try {
      await createQualityInspection(
        {
          workOrderOperationId: values.workOrderOperationId,
          inspectionSpecId: values.inspectionSpecId,
          inspectorId: values.inspectorId,
          result: values.result ?? null,
          inspectedQty: values.inspectedQty,
          inspectedAt: values.inspectedAt,
          defectRecords: values.defectRecords.map((dr) => ({
            defectCodeId: dr.defectCodeId,
            qty: dr.qty,
            severity: dr.severity,
            disposition: dr.disposition ?? null,
          })),
        },
        tenantId
      )
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      alert(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      title="공정검사 등록"
      description="작업지시 공정에 대한 품질검사를 등록합니다."
      isLoading={isLoading}
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <Form {...form}>
        <div className="space-y-6">

          {/* 섹션 1: 기본 정보 */}
          <div className="space-y-4">
            <p className="text-[15px] font-medium text-foreground">검사 기본 정보</p>

            {/* 작업지시 공정 */}
            <FormField
              control={form.control}
              name="workOrderOperationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>작업지시 공정</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={handleOperationChange}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="작업지시 공정 선택" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {workOrderOperations.map((op) => (
                        <SelectItem key={op.id} value={op.id} className="text-[13px]">
                          {op.workOrder.orderNo} — [{op.workOrder.item.code}]{" "}
                          {op.workOrder.item.name} / {op.routingOperation.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 검사기준 (자동 표시) */}
            <div className="space-y-1.5">
              <Label className="text-[14px]">검사기준</Label>
              {loadingSpec ? (
                <div className="h-9 flex items-center px-3 border rounded-md bg-muted text-[13px] text-muted-foreground">
                  검사기준 조회 중...
                </div>
              ) : resolvedSpec ? (
                <div className="h-auto min-h-9 flex items-start px-3 py-2 border rounded-md bg-muted/30 text-[13px] gap-2">
                  <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">
                      [{resolvedSpec.item.code}] {resolvedSpec.item.name} — {resolvedSpec.routingOperation.name}
                    </p>
                    <p className="text-muted-foreground text-[12px]">
                      버전 {resolvedSpec.version} · 검사항목 {resolvedSpec.inspectionItems.length}개
                    </p>
                  </div>
                </div>
              ) : (
                <div className="h-9 flex items-center px-3 border rounded-md bg-amber-50 border-amber-200 text-[13px] text-amber-700">
                  공정 선택 시 활성 검사기준이 자동 로드됩니다
                </div>
              )}
              {/* hidden field for validation */}
              <FormField
                control={form.control}
                name="inspectionSpecId"
                render={() => (
                  <FormItem className="hidden">
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* 검사자 */}
            <FormSelectField
              control={form.control}
              name="inspectorId"
              label="검사자"
              placeholder="검사자 선택"
              options={profiles.map((p) => ({
                label: `${p.displayName} (${p.email})`,
                value: p.id,
              }))}
            />

            <div className="grid grid-cols-2 gap-4">
              {/* 검사수량 */}
              <FormNumberField
                control={form.control}
                name="inspectedQty"
                label="검사수량"
                placeholder="0"
                min={0.001}
                step={1}
              />

              {/* 검사일시 */}
              <FormField
                control={form.control}
                name="inspectedAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>검사일시</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* 판정 결과 */}
            <FormSelectField
              control={form.control}
              name="result"
              label="판정 결과 (선택)"
              placeholder="나중에 판정"
              options={INSPECTION_RESULT_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
            />
          </div>

          {/* 검사항목 (읽기전용 미리보기) */}
          {resolvedSpec && resolvedSpec.inspectionItems.length > 0 && (
            <div className="pt-4 border-t space-y-3">
              <p className="text-[15px] font-medium text-foreground">검사항목 목록</p>
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[13px] w-10">순서</TableHead>
                      <TableHead className="text-[13px]">항목명</TableHead>
                      <TableHead className="text-[13px] w-20">유형</TableHead>
                      <TableHead className="text-[13px] w-20 text-right">하한</TableHead>
                      <TableHead className="text-[13px] w-20 text-right">상한</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resolvedSpec.inspectionItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-[13px] text-center">{item.seq}</TableCell>
                        <TableCell className="text-[13px]">{item.name}</TableCell>
                        <TableCell className="text-[12px] text-muted-foreground">{item.inputType}</TableCell>
                        <TableCell className="text-[13px] text-right font-mono">
                          {item.lowerLimit != null ? Number(item.lowerLimit) : "—"}
                        </TableCell>
                        <TableCell className="text-[13px] text-right font-mono">
                          {item.upperLimit != null ? Number(item.upperLimit) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* 섹션 2: 불량 기록 */}
          <div className="pt-4 border-t space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-medium text-foreground">불량 기록 (선택)</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[13px]"
                onClick={() =>
                  appendDefect({
                    defectCodeId: "",
                    qty: 1,
                    severity: "MAJOR",
                    disposition: null,
                  })
                }
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                불량 추가
              </Button>
            </div>

            {defectFields.length === 0 ? (
              <p className="text-[13px] text-muted-foreground py-2">
                불량이 없으면 비워두세요.
              </p>
            ) : (
              <div className="space-y-3">
                {defectFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="border rounded-md p-3 space-y-3 bg-muted/20"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-muted-foreground">
                        불량 #{index + 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => removeDefect(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <FormField
                      control={form.control}
                      name={`defectRecords.${index}.defectCodeId`}
                      render={({ field: f }) => (
                        <FormItem>
                          <FormLabel className="text-[13px]">불량코드</FormLabel>
                          <Select onValueChange={f.onChange} value={f.value}>
                            <FormControl>
                              <SelectTrigger className="text-[13px]">
                                <SelectValue placeholder="불량코드 선택" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {defectCodes.map((dc) => (
                                <SelectItem key={dc.id} value={dc.id} className="text-[13px]">
                                  [{dc.code}] {dc.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-3 gap-3">
                      <FormField
                        control={form.control}
                        name={`defectRecords.${index}.qty`}
                        render={({ field: f }) => (
                          <FormItem>
                            <FormLabel className="text-[13px]">수량</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                step={1}
                                className="text-[13px]"
                                {...f}
                                value={f.value ?? ""}
                                onChange={(e) =>
                                  f.onChange(parseFloat(e.target.value) || 1)
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`defectRecords.${index}.severity`}
                        render={({ field: f }) => (
                          <FormItem>
                            <FormLabel className="text-[13px]">중요도</FormLabel>
                            <Select onValueChange={f.onChange} value={f.value}>
                              <FormControl>
                                <SelectTrigger className="text-[13px]">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {DEFECT_SEVERITY_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value} className="text-[13px]">
                                    {o.label}
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
                        name={`defectRecords.${index}.disposition`}
                        render={({ field: f }) => (
                          <FormItem>
                            <FormLabel className="text-[13px]">처리방법</FormLabel>
                            <Select
                              onValueChange={(v) => f.onChange(v === "__none__" ? null : v)}
                              value={f.value ?? "__none__"}
                            >
                              <FormControl>
                                <SelectTrigger className="text-[13px]">
                                  <SelectValue placeholder="선택" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="__none__" className="text-[13px] text-muted-foreground">
                                  미정
                                </SelectItem>
                                {DEFECT_DISPOSITION_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value} className="text-[13px]">
                                    {o.label}
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
                ))}
              </div>
            )}
          </div>
        </div>
      </Form>
    </FormSheet>
  )
}
