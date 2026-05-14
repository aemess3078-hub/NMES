import { z } from "zod"

export const partnerFormSchema = z.object({
  code: z.string().min(1, "코드를 입력하세요").max(50),
  name: z.string().min(1, "이름을 입력하세요").max(200),
  partnerType: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"], {
    required_error: "유형을 선택하세요",
  }),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
})

export type PartnerFormValues = z.infer<typeof partnerFormSchema>
