import { z } from "zod"

export const itemFormSchema = z.object({
  code: z.string().min(1, "품목코드를 입력하세요").max(50),
  name: z.string().min(1, "품목명을 입력하세요").max(200),
  itemType: z.enum(["RAW_MATERIAL", "SEMI_FINISHED", "FINISHED", "CONSUMABLE"], {
    required_error: "품목유형을 선택하세요",
  }),
  categoryId: z.string().nullable().optional(),
  uom: z.string({ required_error: "단위를 선택하세요" }).min(1),
  spec: z.string().nullable().optional(),
  isLotTracked: z.boolean().default(false),
  isSerialTracked: z.boolean().default(false),
  status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]).default("ACTIVE"),
})

export type ItemFormValues = z.infer<typeof itemFormSchema>
