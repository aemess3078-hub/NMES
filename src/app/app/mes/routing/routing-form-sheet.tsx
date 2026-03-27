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
  FormSwitchField,
} from "@/components/common/form-sheet"
import { routingFormSchema, RoutingFormValues } from "./routing-form-schema"
import { createRouting, updateRouting, RoutingWithDetails } from "@/lib/actions/routing.actions"
import { RoutingStatus } from "@prisma/client"

interface WorkCenter {
  id: string
  code: string
  name: string
}

interface ItemOption {
  id: string
  code: string
  name: string
  itemType: string
}

interface RoutingFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit"
  routing?: RoutingWithDetails | null
  items: ItemOption[]
  workCenters: WorkCenter[]
  tenantId: string
}

const DEFAULT_FORM_VALUES: RoutingFormValues = {
  itemId: "",
  version: "1.0",
  isDefault: false,
  status: RoutingStatus.DRAFT,
  operations: [],
}

const itemTypeLabels: Record<string, string> = {
  RAW_MATERIAL: "원자재",
  SEMI_FINISHED: "반제품",
  FINISHED: "완제품",
  CONSUMABLE: "소모품",
}

export function RoutingFormSheet({
  open,
  onOpenChange,
  mode,
  routing,
  items,
  workCenters,
  tenantId,
}: RoutingFormSheetProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const form = useForm<RoutingFormValues>({
    resolver: zodResolver(routingFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "operations",
  })

  useEffect(() => {
    if (mode === "edit" && routing && open) {
      form.reset({
        itemId: routing.itemId,
        version: routing.version,
        isDefault: routing.isDefault,
        status: routing.status,
        operations: routing.operations.map((op) => ({
          seq: op.seq,
          operationCode: op.operationCode,
          name: op.name,
          workCenterId: op.workCenterId,
          standardTime: Number(op.standardTime),
        })),
      })
    }
    if (mode === "create" && open) {
      form.reset(DEFAULT_FORM_VALUES)
    }
  }, [mode, routing, open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(values: RoutingFormValues) {
    setIsLoading(true)
    try {
      const payload = {
        itemId: values.itemId,
        version: values.version,
        isDefault: values.isDefault,
        status: values.status,
        operations: values.operations.map((op) => ({
          seq: op.seq,
          operationCode: op.operationCode,
          name: op.name,
          workCenterId: op.workCenterId,
          standardTime: op.standardTime,
        })),
      }

      if (mode === "create") {
        await createRouting(payload, tenantId)
      } else if (routing) {
        await updateRouting(routing.id, payload)
      }
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      console.error("저장 실패:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddOperation = () => {
    const nextSeq = fields.length + 1
    append({
      seq: nextSeq,
      operationCode: "",
      name: "",
      workCenterId: "",
      standardTime: 0,
    })
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      title={mode === "create" ? "라우팅 등록" : "라우팅 수정"}
      description={
        mode === "create"
          ? "새로운 공정 라우팅을 등록합니다."
          : "공정 라우팅 정보를 수정합니다."
      }
      isLoading={isLoading}
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <Form {...form}>
        <div className="space-y-6">
          {/* 라우팅 헤더 정보 */}
          <div className="space-y-4">
            <p className="text-[15px] font-medium text-foreground">라우팅 정보</p>

            <FormSelectField
              control={form.control}
              name="itemId"
              label="대상 품목"
              placeholder="완제품 또는 반제품 선택"
              options={items.map((item) => ({
                label: `[${item.code}] ${item.name} (${itemTypeLabels[item.itemType] ?? item.itemType})`,
                value: item.id,
              }))}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormTextField
                control={form.control}
                name="version"
                label="버전"
                placeholder="예: 1.0"
              />
              <FormSelectField
                control={form.control}
                name="status"
                label="상태"
                options={[
                  { label: "초안", value: RoutingStatus.DRAFT },
                  { label: "활성", value: RoutingStatus.ACTIVE },
                  { label: "비활성", value: RoutingStatus.INACTIVE },
                ]}
              />
            </div>

            <FormSwitchField
              control={form.control}
              name="isDefault"
              label="기본 라우팅"
              description="이 라우팅을 해당 품목의 기본 라우팅으로 설정합니다."
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
                onClick={handleAddOperation}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                공정 추가
              </Button>
            </div>

            {fields.length > 0 && (
              <div className="rounded-md border overflow-hidden">
                <div className="grid grid-cols-[36px_80px_1fr_1fr_72px_36px] gap-0 bg-muted/50 px-3 py-2 text-[13px] font-medium text-muted-foreground">
                  <span>순서</span>
                  <span>공정코드</span>
                  <span>공정명</span>
                  <span>작업장</span>
                  <span className="text-right">표준시간(분)</span>
                  <span></span>
                </div>

                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="grid grid-cols-[36px_80px_1fr_1fr_72px_36px] gap-0 items-center px-3 py-2 border-t first:border-t-0 hover:bg-muted/20"
                  >
                    {/* 순서 */}
                    <span className="text-[13px] text-muted-foreground">
                      {index + 1}
                    </span>

                    {/* 공정코드 */}
                    <FormField
                      control={form.control}
                      name={`operations.${index}.operationCode`}
                      render={({ field: f }) => (
                        <FormItem className="pr-2">
                          <Input
                            className="h-8 text-[13px]"
                            placeholder="코드"
                            {...f}
                          />
                          <FormMessage className="text-[12px]" />
                        </FormItem>
                      )}
                    />

                    {/* 공정명 */}
                    <FormField
                      control={form.control}
                      name={`operations.${index}.name`}
                      render={({ field: f }) => (
                        <FormItem className="pr-2">
                          <Input
                            className="h-8 text-[13px]"
                            placeholder="공정명"
                            {...f}
                          />
                          <FormMessage className="text-[12px]" />
                        </FormItem>
                      )}
                    />

                    {/* 작업장 */}
                    <FormField
                      control={form.control}
                      name={`operations.${index}.workCenterId`}
                      render={({ field: f }) => (
                        <FormItem className="pr-2">
                          <Select
                            onValueChange={f.onChange}
                            value={f.value ?? undefined}
                          >
                            <SelectTrigger className="h-8 text-[13px]">
                              <SelectValue placeholder="작업장 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              {workCenters.map((wc) => (
                                <SelectItem
                                  key={wc.id}
                                  value={wc.id}
                                  className="text-[13px]"
                                >
                                  [{wc.code}] {wc.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage className="text-[12px]" />
                        </FormItem>
                      )}
                    />

                    {/* 표준시간 */}
                    <FormField
                      control={form.control}
                      name={`operations.${index}.standardTime`}
                      render={({ field: f }) => (
                        <FormItem className="pr-2">
                          <Input
                            type="number"
                            min={0}
                            step={0.1}
                            className="h-8 text-[13px] text-right"
                            value={f.value ?? ""}
                            onChange={(e) => {
                              const val = e.target.value
                              f.onChange(val === "" ? 0 : parseFloat(val))
                            }}
                          />
                          <FormMessage className="text-[12px]" />
                        </FormItem>
                      )}
                    />

                    {/* 삭제 버튼 */}
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
                공정을 추가하세요.
              </div>
            )}

            {/* 공정 목록 전체 에러 메시지 */}
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
