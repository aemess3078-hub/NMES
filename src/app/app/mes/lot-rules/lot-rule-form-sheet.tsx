"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"

import { Form } from "@/components/ui/form"
import {
  FormSheet,
  FormTextField,
  FormSelectField,
  FormNumberField,
} from "@/components/common/form-sheet"
import { lotRuleFormSchema, LotRuleFormValues } from "@/app/app/mes/lot/lot-form-schema"
import {
  createLotRule,
  updateLotRule,
} from "@/lib/actions/lot.actions"

// ─── Types ────────────────────────────────────────────────────────────────────

type LotRuleRow = {
  id: string
  tenantId: string
  itemId: string
  prefix: string | null
  dateFormat: string | null
  seqLength: number
  item: { id: string; code: string; name: string; itemType: string }
}

interface LotRuleFormSheetProps {
  mode: "create" | "edit"
  rule?: LotRuleRow | null
  items: { id: string; code: string; name: string; itemType: string }[]
  tenantId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  RAW_MATERIAL:  "원자재",
  SEMI_FINISHED: "반제품",
  FINISHED:      "완제품",
  CONSUMABLE:    "소모품",
}

const DEFAULT_VALUES: LotRuleFormValues = {
  itemId: "",
  prefix: "",
  dateFormat: "YYYYMMDD",
  seqLength: 4,
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LotRuleFormSheet({
  mode,
  rule,
  items,
  tenantId,
  open,
  onOpenChange,
}: LotRuleFormSheetProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const form = useForm<LotRuleFormValues>({
    resolver: zodResolver(lotRuleFormSchema),
    defaultValues: DEFAULT_VALUES,
  })

  useEffect(() => {
    if (open) {
      if (mode === "create") {
        form.reset(DEFAULT_VALUES)
      } else if (rule) {
        form.reset({
          itemId: rule.itemId,
          prefix: rule.prefix ?? "",
          dateFormat: rule.dateFormat ?? "YYYYMMDD",
          seqLength: rule.seqLength,
        })
      }
    }
  }, [open, mode, rule]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(values: LotRuleFormValues) {
    setIsLoading(true)
    try {
      if (mode === "create") {
        await createLotRule(
          {
            itemId: values.itemId,
            prefix: values.prefix || null,
            dateFormat: values.dateFormat || null,
            seqLength: values.seqLength,
          },
          tenantId
        )
      } else if (rule) {
        await updateLotRule(rule.id, {
          itemId: values.itemId,
          prefix: values.prefix || null,
          dateFormat: values.dateFormat || null,
          seqLength: values.seqLength,
        })
      }
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
      mode={mode}
      title={mode === "create" ? "LOT 규칙 추가" : "LOT 규칙 수정"}
      description={
        mode === "create"
          ? "품목별 LOT 번호 생성 규칙을 설정합니다."
          : "LOT 번호 생성 규칙을 수정합니다."
      }
      isLoading={isLoading}
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <Form {...form}>
        <div className="space-y-4">
          <p className="text-[15px] font-medium text-foreground">규칙 설정</p>

          <FormSelectField
            control={form.control}
            name="itemId"
            label="품목"
            placeholder="품목 선택"
            options={items.map((item) => ({
              label: `[${item.code}] ${item.name} (${ITEM_TYPE_LABELS[item.itemType] ?? item.itemType})`,
              value: item.id,
            }))}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormTextField
              control={form.control}
              name="prefix"
              label="Prefix"
              placeholder="예: LOT, MAT, FG"
            />

            <FormTextField
              control={form.control}
              name="dateFormat"
              label="날짜 형식"
              placeholder="예: YYYYMMDD"
            />
          </div>

          <FormNumberField
            control={form.control}
            name="seqLength"
            label="순번 자릿수"
            placeholder="4"
            min={3}
            max={8}
            step={1}
          />

          <div className="bg-slate-50 rounded-lg p-4 text-[13px] text-muted-foreground">
            <p className="font-medium text-slate-600 mb-1">생성 예시</p>
            <p className="font-mono">
              {form.watch("prefix") || "LOT"}-
              {form.watch("dateFormat") || "YYYYMMDD"}-
              {"0".repeat(form.watch("seqLength") || 4)}1
            </p>
          </div>
        </div>
      </Form>
    </FormSheet>
  )
}
