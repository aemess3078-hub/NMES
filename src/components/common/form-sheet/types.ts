import * as React from "react"

export type FormMode = "create" | "edit" | "view"

export interface FormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: FormMode
  title: string
  description?: string
  isLoading?: boolean
  onSubmit?: () => void
  children: React.ReactNode
}
