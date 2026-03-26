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
  FormSwitchField,
  FormTextareaField,
} from "@/components/common/form-sheet"
import { itemFormSchema, ItemFormValues } from "./item-form-schema"
import { createItem, updateItem } from "@/lib/actions/item.actions"

interface Category {
  id: string
  code: string
  name: string
}

interface ItemFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit"
  defaultValues?: Partial<ItemFormValues>
  itemId?: string
  categories: Category[]
  tenantId: string
}

const DEFAULT_FORM_VALUES: ItemFormValues = {
  code: "",
  name: "",
  itemType: "RAW_MATERIAL",
  categoryId: null,
  uom: "EA",
  spec: null,
  isLotTracked: false,
  isSerialTracked: false,
  status: "ACTIVE",
}

// UOM enum의 실제 값 (schema.prisma 기준: EA KG G L ML M CM MM BOX SET)
const uomOptions = [
  { label: "EA (개)", value: "EA" },
  { label: "KG (킬로그램)", value: "KG" },
  { label: "G (그램)", value: "G" },
  { label: "L (리터)", value: "L" },
  { label: "ML (밀리리터)", value: "ML" },
  { label: "M (미터)", value: "M" },
  { label: "CM (센티미터)", value: "CM" },
  { label: "MM (밀리미터)", value: "MM" },
  { label: "BOX", value: "BOX" },
  { label: "SET", value: "SET" },
]

export function ItemFormSheet({
  open,
  onOpenChange,
  mode,
  defaultValues,
  itemId,
  categories,
  tenantId,
}: ItemFormSheetProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: defaultValues ?? DEFAULT_FORM_VALUES,
  })

  useEffect(() => {
    if (open) {
      form.reset(defaultValues ?? DEFAULT_FORM_VALUES)
    }
  }, [open, defaultValues, form])

  async function onSubmit(values: ItemFormValues) {
    setIsLoading(true)
    try {
      if (mode === "create") {
        await createItem(values, tenantId)
      } else if (itemId) {
        await updateItem(itemId, values)
      }
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      console.error("저장 실패:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      title={mode === "create" ? "품목 등록" : "품목 수정"}
      description={
        mode === "create"
          ? "새로운 품목을 등록합니다."
          : "품목 정보를 수정합니다."
      }
      isLoading={isLoading}
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <Form {...form}>
        <div className="space-y-4">
          {/* 기본 정보 */}
          <p className="text-[15px] font-medium text-foreground">기본 정보</p>

          <FormTextField
            control={form.control}
            name="code"
            label="품목코드"
            placeholder="예: RM-001"
            description="중복되지 않는 고유 코드를 입력하세요."
          />

          <FormTextField
            control={form.control}
            name="name"
            label="품목명"
            placeholder="예: SUS304 철판"
          />

          <div className="grid grid-cols-2 gap-4">
            <FormSelectField
              control={form.control}
              name="itemType"
              label="품목유형"
              options={[
                { label: "원자재", value: "RAW_MATERIAL" },
                { label: "반제품", value: "SEMI_FINISHED" },
                { label: "완제품", value: "FINISHED" },
                { label: "소모품", value: "CONSUMABLE" },
              ]}
            />
            <FormSelectField
              control={form.control}
              name="uom"
              label="단위"
              options={uomOptions}
            />
          </div>

          <FormSelectField
            control={form.control}
            name="categoryId"
            label="카테고리"
            placeholder="선택 (선택사항)"
            options={categories.map((c) => ({ label: c.name, value: c.id }))}
          />

          <FormTextareaField
            control={form.control}
            name="spec"
            label="규격"
            placeholder="예: t3.0 x 1000 x 2000"
            rows={2}
          />

          {/* 추적 설정 */}
          <div className="pt-4 border-t">
            <p className="text-[15px] font-medium text-foreground mb-4">
              추적 설정
            </p>
            <div className="space-y-3">
              <FormSwitchField
                control={form.control}
                name="isLotTracked"
                label="LOT 추적"
                description="이 품목의 입출고를 LOT 단위로 추적합니다."
              />
              <FormSwitchField
                control={form.control}
                name="isSerialTracked"
                label="시리얼 추적"
                description="이 품목을 시리얼 번호 단위로 추적합니다."
              />
            </div>
          </div>

          {/* 상태 */}
          <div className="pt-4 border-t">
            <FormSelectField
              control={form.control}
              name="status"
              label="상태"
              options={[
                { label: "활성", value: "ACTIVE" },
                { label: "비활성", value: "INACTIVE" },
                { label: "단종", value: "DISCONTINUED" },
              ]}
            />
          </div>
        </div>
      </Form>
    </FormSheet>
  )
}
