import { z } from "zod"
import { PlanType, PlanStatus } from "@prisma/client"

export const planItemFormSchema = z.object({
  itemId: z.string().min(1, "품목을 선택하세요"),
  bomId: z.string().optional().nullable(),
  routingId: z.string().optional().nullable(),
  plannedQty: z.number().positive("계획수량은 양수여야 합니다"),
  note: z.string().optional().nullable(),
})

export const planFormSchema = z
  .object({
    siteId: z.string().min(1, "공장을 선택하세요"),
    planNo: z.string().min(1, "계획번호를 입력하세요"),
    planType: z.nativeEnum(PlanType),
    startDate: z.string().min(1, "시작일을 선택하세요"),
    endDate: z.string().min(1, "종료일을 선택하세요"),
    status: z.nativeEnum(PlanStatus).default(PlanStatus.DRAFT),
    note: z.string().optional().nullable(),
    items: z.array(planItemFormSchema).min(1, "품목을 최소 1개 이상 추가하세요"),
  })
  .refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
    message: "종료일은 시작일 이후여야 합니다",
    path: ["endDate"],
  })
  .refine(
    (data) => {
      const itemIds = data.items.map((item) => item.itemId).filter(Boolean)
      return new Set(itemIds).size === itemIds.length
    },
    {
      message: "동일한 품목을 생산계획에 중복으로 등록할 수 없습니다.",
      path: ["items"],
    }
  )

export type PlanItemFormValues = z.infer<typeof planItemFormSchema>
export type PlanFormValues = z.infer<typeof planFormSchema>
