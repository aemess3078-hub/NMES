"use client"

import { useState, useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Form } from "@/components/ui/form"
import {
  FormSheet,
  FormTextField,
  FormSelectField,
  FormSwitchField,
  FormTextareaField,
} from "@/components/common/form-sheet"
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { itemFormSchema, ItemFormValues } from "./item-form-schema"
import { createItem, updateItem } from "@/lib/actions/item.actions"
import { ITEM_TYPE_LABELS } from "./columns"

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = {
  id:       string
  code:     string
  name:     string
  itemType: string | null
}

type ItemGroupOption = {
  id:         string
  code:       string
  name:       string
  categoryId: string
}

interface ItemFormSheetProps {
  open:         boolean
  onOpenChange: (open: boolean) => void
  mode:         "create" | "edit"
  defaultValues?: Partial<ItemFormValues>
  itemId?:      string
  categories:   Category[]
  itemGroups:   ItemGroupOption[]
  tenantId:     string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_FORM_VALUES: ItemFormValues = {
  code:            "",
  name:            "",
  categoryId:      "",
  itemGroupId:     null,
  uom:             "EA",
  spec:            null,
  isLotTracked:    false,
  isSerialTracked: false,
  status:          "ACTIVE",
}

const UOM_OPTIONS = [
  { label: "EA (개)",         value: "EA" },
  { label: "KG (킬로그램)",   value: "KG" },
  { label: "G (그램)",        value: "G" },
  { label: "L (리터)",        value: "L" },
  { label: "ML (밀리리터)",   value: "ML" },
  { label: "M (미터)",        value: "M" },
  { label: "CM (센티미터)",   value: "CM" },
  { label: "MM (밀리미터)",   value: "MM" },
  { label: "BOX",             value: "BOX" },
  { label: "SET",             value: "SET" },
]

const ERROR_MESSAGES: Record<string, string> = {
  DUPLICATE_CODE:          "동일한 품목코드가 이미 존재합니다.",
  INVALID_CATEGORY:        "유효하지 않은 품목분류입니다.",
  CATEGORY_NO_TYPE:        "해당 품목분류에 시스템 유형이 지정되지 않았습니다. 품목분류관리에서 먼저 설정해주세요.",
  INVALID_GROUP:           "유효하지 않은 품목군입니다.",
  GROUP_CATEGORY_MISMATCH: "선택한 품목군이 해당 품목분류에 속하지 않습니다.",
  NOT_FOUND:               "품목을 찾을 수 없습니다.",
  FORBIDDEN:               "권한이 없습니다.",
}

const itemTypeBadgeClass: Record<string, string> = {
  FINISHED:      "bg-blue-100 text-blue-800 border-blue-200",
  SEMI_FINISHED: "bg-purple-100 text-purple-800 border-purple-200",
  RAW_MATERIAL:  "bg-amber-100 text-amber-800 border-amber-200",
  CONSUMABLE:    "bg-slate-100 text-slate-700 border-slate-200",
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ItemFormSheet({
  open,
  onOpenChange,
  mode,
  defaultValues,
  itemId,
  categories,
  itemGroups,
  tenantId: _tenantId,
}: ItemFormSheetProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: defaultValues ?? DEFAULT_FORM_VALUES,
  })

  // 품목분류 선택 감지
  const watchedCategoryId = form.watch("categoryId")

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === watchedCategoryId) ?? null,
    [categories, watchedCategoryId],
  )

  const availableGroups = useMemo(
    () => itemGroups.filter((g) => g.categoryId === watchedCategoryId),
    [itemGroups, watchedCategoryId],
  )

  // 품목분류 변경 시 품목군 초기화 (다른 분류 소속이면 리셋)
  useEffect(() => {
    const currentGroupId = form.getValues("itemGroupId")
    if (currentGroupId && !availableGroups.some((g) => g.id === currentGroupId)) {
      form.setValue("itemGroupId", null)
    }
  }, [watchedCategoryId, availableGroups, form])

  useEffect(() => {
    if (open) {
      form.reset(defaultValues ?? DEFAULT_FORM_VALUES)
      form.clearErrors()
    }
  }, [open, defaultValues, form])

  async function onSubmit(values: ItemFormValues) {
    setIsLoading(true)
    try {
      if (mode === "create") {
        await createItem(values)
      } else if (itemId) {
        await updateItem(itemId, values)
      }
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      const key = error instanceof Error ? error.message : ""
      const msg = ERROR_MESSAGES[key]
      if (key === "DUPLICATE_CODE") {
        form.setError("code", { type: "manual", message: msg })
      } else if (key === "INVALID_CATEGORY" || key === "CATEGORY_NO_TYPE") {
        form.setError("categoryId", { type: "manual", message: msg })
      } else if (key === "INVALID_GROUP" || key === "GROUP_CATEGORY_MISMATCH") {
        form.setError("itemGroupId", { type: "manual", message: msg })
      } else {
        form.setError("root", { message: msg ?? (error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.") })
      }
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
      description={mode === "create" ? "새로운 품목을 등록합니다." : "품목 정보를 수정합니다."}
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

          {/* 품목분류 + 시스템 유형 표시 */}
          <div className="space-y-2">
            <FormSelectField
              control={form.control}
              name="categoryId"
              label="품목분류"
              placeholder="품목분류 선택 (필수)"
              options={categories.map((c) => ({ label: c.name, value: c.id }))}
            />

            {/* 선택된 품목분류의 시스템 유형 자동 표시 */}
            {watchedCategoryId && (
              <div className="flex items-center gap-2 px-1">
                <span className="text-[13px] text-muted-foreground">시스템 유형:</span>
                {selectedCategory?.itemType ? (
                  <Badge
                    variant="outline"
                    className={`text-[13px] ${itemTypeBadgeClass[selectedCategory.itemType] ?? ""}`}
                  >
                    {ITEM_TYPE_LABELS[selectedCategory.itemType as keyof typeof ITEM_TYPE_LABELS] ?? selectedCategory.itemType}
                  </Badge>
                ) : (
                  <span className="text-[13px] text-amber-600 font-medium">
                    ⚠ 시스템 유형 미지정 — 품목분류관리에서 먼저 설정해주세요
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 품목군 (품목분류 연동 필터) */}
          <FormField
            control={form.control}
            name="itemGroupId"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[14px]">품목군</FormLabel>
                <Select
                  value={field.value ?? "NONE"}
                  onValueChange={(v) => field.onChange(v === "NONE" ? null : v)}
                  disabled={!watchedCategoryId}
                >
                  <FormControl>
                    <SelectTrigger className="text-[14px]">
                      <SelectValue
                        placeholder={
                          watchedCategoryId
                            ? availableGroups.length > 0
                              ? "품목군 선택 (선택사항)"
                              : "해당 품목분류에 품목군 없음"
                            : "품목분류를 먼저 선택하세요"
                        }
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="NONE" className="text-[14px] text-muted-foreground">
                      품목군 미지정
                    </SelectItem>
                    {availableGroups.map((g) => (
                      <SelectItem key={g.id} value={g.id} className="text-[14px]">
                        {g.name}
                        <span className="ml-1.5 text-[12px] text-muted-foreground font-mono">
                          ({g.code})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage className="text-[13px]" />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormSelectField
              control={form.control}
              name="uom"
              label="단위"
              options={UOM_OPTIONS}
            />
          </div>

          <FormTextareaField
            control={form.control}
            name="spec"
            label="규격"
            placeholder="예: t3.0 x 1000 x 2000"
            rows={2}
          />

          {/* 추적 설정 */}
          <div className="pt-4 border-t">
            <p className="text-[15px] font-medium text-foreground mb-4">추적 설정</p>
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
                { label: "활성",  value: "ACTIVE" },
                { label: "비활성", value: "INACTIVE" },
                { label: "단종",  value: "DISCONTINUED" },
              ]}
            />
          </div>

          {/* 루트 에러 */}
          {form.formState.errors.root && (
            <p className="text-[13px] text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {form.formState.errors.root.message}
            </p>
          )}
        </div>
      </Form>
    </FormSheet>
  )
}
