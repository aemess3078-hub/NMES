import { z } from "zod"
import { RoutingStatus } from "@prisma/client"

export const routingOperationFormSchema = z.object({
  seq: z.number().int().positive("순서는 양수여야 합니다"),
  operationCode: z.string().min(1, "공정코드를 입력하세요"),
  name: z.string().min(1, "공정명을 입력하세요"),
  workCenterId: z.string().min(1, "작업장을 선택하세요"),
  standardTime: z.number().min(0, "표준시간은 0 이상이어야 합니다"),
})

export const routingFormSchema = z.object({
  itemId: z.string().min(1, "품목을 선택하세요"),
  version: z.string().min(1, "버전을 입력하세요"),
  isDefault: z.boolean().default(false),
  status: z.nativeEnum(RoutingStatus).default(RoutingStatus.DRAFT),
  operations: z.array(routingOperationFormSchema).min(1, "공정을 최소 1개 이상 추가하세요"),
})

export type RoutingOperationFormValues = z.infer<typeof routingOperationFormSchema>
export type RoutingFormValues = z.infer<typeof routingFormSchema>
