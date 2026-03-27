"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { Wand2 } from "lucide-react"

import { Form } from "@/components/ui/form"
import { Button } from "@/components/ui/button"
import {
  FormSheet,
  FormTextField,
  FormSelectField,
  FormNumberField,
  FormDateField,
} from "@/components/common/form-sheet"
import { lotFormSchema, LotFormValues } from "./lot-form-schema"
import { createLot, generateLotNo } from "@/lib/actions/lot.actions"

// ─── Types ────────────────────────────────────────────────────────────────────

interface LotFormSheetProps {
  items: { id: string; code: string; name: string; itemType: string; uom: string }[]
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

const DEFAULT_VALUES: LotFormValues = {
  itemId: "",
  lotNo: "",
  qty: 1,
  manufactureDate: null,
  expiryDate: null,
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LotFormSheet({
  items,
  tenantId,
  open,
  onOpenChange,
}: LotFormSheetProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const router = useRouter()

  const form = useForm<LotFormValues>({
    resolver: zodResolver(lotFormSchema),
    defaultValues: DEFAULT_VALUES,
  })

  useEffect(() => {
    if (open) {
      form.reset(DEFAULT_VALUES)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 자동 번호 생성 ──────────────────────────────────────────────────────────

  const handleAutoGenerate = async () => {
    const itemId = form.getValues("itemId")
    if (!itemId) {
      alert("품목을 먼저 선택하세요.")
      return
    }
    setIsGenerating(true)
    try {
      const lotNo = await generateLotNo(itemId, tenantId)
      form.setValue("lotNo", lotNo, { shouldValidate: true })
    } catch {
      alert("LOT번호 생성에 실패했습니다.")
    } finally {
      setIsGenerating(false)
    }
  }

  // ─── 저장 ────────────────────────────────────────────────────────────────────

  async function onSubmit(values: LotFormValues) {
    setIsLoading(true)
    try {
      await createLot(
        {
          itemId: values.itemId,
          lotNo: values.lotNo,
          qty: values.qty,
          manufactureDate: values.manufactureDate ?? null,
          expiryDate: values.expiryDate ?? null,
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
      title="LOT 등록"
      description="새로운 LOT를 등록합니다."
      isLoading={isLoading}
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <Form {...form}>
        <div className="space-y-6">
          <div className="space-y-4">
            <p className="text-[15px] font-medium text-foreground">기본 정보</p>

            {/* 품목 */}
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

            {/* LOT번호 + 자동생성 버튼 */}
            <div className="space-y-2">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <FormTextField
                    control={form.control}
                    name="lotNo"
                    label="LOT번호"
                    placeholder="LOT-20260327-001"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 text-[13px] shrink-0"
                  onClick={handleAutoGenerate}
                  disabled={isGenerating}
                >
                  <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                  {isGenerating ? "생성 중..." : "자동생성"}
                </Button>
              </div>
            </div>

            {/* 수량 */}
            <FormNumberField
              control={form.control}
              name="qty"
              label="수량"
              placeholder="0"
              min={0.001}
              step={1}
            />
          </div>

          <div className="pt-4 border-t space-y-4">
            <p className="text-[15px] font-medium text-foreground">날짜 정보 (선택)</p>

            <div className="grid grid-cols-2 gap-4">
              <FormDateField
                control={form.control}
                name="manufactureDate"
                label="제조일"
              />
              <FormDateField
                control={form.control}
                name="expiryDate"
                label="유효기한"
              />
            </div>
          </div>
        </div>
      </Form>
    </FormSheet>
  )
}
