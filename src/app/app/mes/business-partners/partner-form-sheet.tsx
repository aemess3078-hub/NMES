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
} from "@/components/common/form-sheet"
import { partnerFormSchema, PartnerFormValues } from "./partner-form-schema"
import { createBusinessPartner, updateBusinessPartner } from "@/lib/actions/business-partner.actions"
import { PartnerType } from "@prisma/client"

interface PartnerFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit"
  defaultValues?: Partial<PartnerFormValues>
  partnerId?: string
  fixedType?: PartnerType
}

const DEFAULT_FORM_VALUES: PartnerFormValues = {
  code: "",
  name: "",
  partnerType: "CUSTOMER",
  status: "ACTIVE",
}

const typeLabels: Record<PartnerType, string> = {
  CUSTOMER: "고객사",
  SUPPLIER: "거래처",
  BOTH: "고객사 + 거래처",
}

export function PartnerFormSheet({
  open,
  onOpenChange,
  mode,
  defaultValues,
  partnerId,
  fixedType,
}: PartnerFormSheetProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const form = useForm<PartnerFormValues>({
    resolver: zodResolver(partnerFormSchema),
    defaultValues: defaultValues ?? { ...DEFAULT_FORM_VALUES, partnerType: fixedType ?? "CUSTOMER" },
  })

  useEffect(() => {
    if (open) {
      form.reset(defaultValues ?? { ...DEFAULT_FORM_VALUES, partnerType: fixedType ?? "CUSTOMER" })
    }
  }, [open, defaultValues, fixedType, form])

  async function onSubmit(values: PartnerFormValues) {
    setIsLoading(true)
    try {
      if (mode === "create") {
        await createBusinessPartner("", values)
      } else if (partnerId) {
        await updateBusinessPartner(partnerId, values)
      }
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      if (error instanceof Error && error.message === "DUPLICATE_CODE") {
        form.setError("code", {
          type: "manual",
          message: "동일한 코드가 이미 존재합니다.",
        })
      } else {
        console.error("저장 실패:", error)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const isCustomerPage = fixedType === "CUSTOMER"
  const entityName = isCustomerPage ? "고객사" : "거래처"

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      title={mode === "create" ? `${entityName} 등록` : `${entityName} 수정`}
      description={
        mode === "create"
          ? `새로운 ${entityName}를 등록합니다.`
          : `${entityName} 정보를 수정합니다.`
      }
      isLoading={isLoading}
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <Form {...form}>
        <div className="space-y-4">
          <p className="text-[15px] font-medium text-foreground">기본 정보</p>

          <FormTextField
            control={form.control}
            name="code"
            label="코드"
            placeholder="예: C-001"
            description="중복되지 않는 고유 코드를 입력하세요."
          />

          <FormTextField
            control={form.control}
            name="name"
            label="이름"
            placeholder={isCustomerPage ? "예: (주)삼성전자" : "예: (주)한국부품"}
          />

          <FormSelectField
            control={form.control}
            name="partnerType"
            label="유형"
            options={Object.entries(typeLabels).map(([value, label]) => ({ label, value }))}
          />

          <div className="pt-4 border-t">
            <FormSelectField
              control={form.control}
              name="status"
              label="상태"
              options={[
                { label: "활성", value: "ACTIVE" },
                { label: "비활성", value: "INACTIVE" },
              ]}
            />
          </div>
        </div>
      </Form>
    </FormSheet>
  )
}
