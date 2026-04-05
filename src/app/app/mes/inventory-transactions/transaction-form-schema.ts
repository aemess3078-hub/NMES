import { z } from "zod"

export const transactionFormSchema = z.object({
  siteId: z.string().min(1, "사이트를 선택하세요"),
  fromLocationId: z.string().optional().nullable(),
  toLocationId: z.string().optional().nullable(),
  itemId: z.string().min(1, "품목을 선택하세요"),
  lotId: z.string().optional().nullable(),
  txType: z.string().min(1, "유형을 선택하세요"),
  qty: z.number().positive("수량은 양수여야 합니다"),
  refType: z.string().optional().nullable(),
  refId: z.string().optional().nullable(),
  issueDestType: z.enum(["SO", "WO", "OTHER"]).optional().nullable(), // UI 전용
  note: z.string().optional().nullable(),
})

export type TransactionFormValues = z.infer<typeof transactionFormSchema>
