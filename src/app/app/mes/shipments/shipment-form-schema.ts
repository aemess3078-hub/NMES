import { z } from "zod"

export const shipmentItemSchema = z.object({
  salesOrderItemId: z.string().min(1, "수주 품목을 선택하세요"),
  itemId: z.string().min(1),
  qty: z.coerce.number().positive("수량은 0보다 커야 합니다"),
  lotId: z.string().optional(),
})

export const shipmentFormSchema = z.object({
  salesOrderId: z.string().min(1, "수주를 선택하세요"),
  plannedDate: z.string().min(1, "출하예정일을 입력하세요"),
  warehouseId: z.string().optional(),
  note: z.string().optional(),
  items: z.array(shipmentItemSchema).min(1, "출하 품목을 1개 이상 추가하세요"),
})

export type ShipmentFormValues = z.infer<typeof shipmentFormSchema>
