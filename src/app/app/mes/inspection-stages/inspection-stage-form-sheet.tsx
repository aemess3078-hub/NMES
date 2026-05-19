"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormSheet } from "@/components/common/form-sheet"
import { createStagedInspection } from "@/lib/actions/inspection-stages.actions"

const schema = z.object({
  workOrderOperationId: z.string().min(1, "작업지시를 선택해주세요"),
  stage: z.enum(["FIRST", "MID", "FINAL"]),
  result: z.enum(["PASS", "FAIL", "CONDITIONAL"]),
  inspectedQty: z.coerce.number().min(1, "검사수량을 입력해주세요"),
})

type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workOrders: any[]
  onSuccess: () => void
}

export function InspectionStageFormSheet({ open, onOpenChange, workOrders, onSuccess }: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      workOrderOperationId: "",
      stage: "FIRST",
      result: "PASS",
      inspectedQty: 1,
    },
  })

  useEffect(() => {
    if (!open) form.reset()
  }, [open])

  async function onSubmit(values: FormValues) {
    const selectedOp = workOrders.find((wo) => wo.id === values.workOrderOperationId)
    if (!selectedOp?.inspectionSpecs?.[0]) {
      alert("선택한 공정에 활성화된 검사표준이 없습니다.")
      return
    }

    await createStagedInspection({
      workOrderOperationId: values.workOrderOperationId,
      inspectionSpecId: selectedOp.inspectionSpecs[0].id,
      stage: values.stage,
      result: values.result,
      inspectedQty: values.inspectedQty,
    })
    onOpenChange(false)
    onSuccess()
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      title="검사 등록"
      onSubmit={form.handleSubmit(onSubmit)}
      isLoading={form.formState.isSubmitting}
    >
      <Form {...form}>
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="workOrderOperationId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>작업지시 공정 *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="공정 선택" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {workOrders.map((wo) => (
                      <SelectItem key={wo.id} value={wo.id}>
                        {wo.workOrder.orderNo} / {wo.routingOperation.name}
                        {wo.inspectionSpecs?.length === 0 && " (검사표준 없음)"}
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
            name="stage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>검사 단계 *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="FIRST">초물검사 (공정 시작 시)</SelectItem>
                    <SelectItem value="MID">중간검사 (공정 중 샘플링)</SelectItem>
                    <SelectItem value="FINAL">종물검사 (공정 완료 시)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="inspectedQty"
            render={({ field }) => (
              <FormItem>
                <FormLabel>검사 수량 *</FormLabel>
                <FormControl>
                  <Input type="number" min={1} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="result"
            render={({ field }) => (
              <FormItem>
                <FormLabel>판정 결과 *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="PASS">합격</SelectItem>
                    <SelectItem value="FAIL">불합격</SelectItem>
                    <SelectItem value="CONDITIONAL">조건부합격</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </Form>
    </FormSheet>
  )
}
