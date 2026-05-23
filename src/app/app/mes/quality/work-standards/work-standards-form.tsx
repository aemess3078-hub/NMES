"use client"

import { useState, useTransition } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createWorkStandard,
  updateWorkStandard,
  type WorkStandardRow,
} from "@/lib/actions/work-standards.actions"

const DOC_TYPE_OPTIONS = [
  { value: "SOP", label: "SOP (작업지시서)" },
  { value: "DRAWING", label: "DRAWING (도면)" },
  { value: "SPEC", label: "SPEC (규격서)" },
  { value: "CERTIFICATE", label: "CERTIFICATE (인증서)" },
  { value: "OTHER", label: "OTHER (기타)" },
] as const

interface Props {
  open: boolean
  onClose: () => void
  editRow: WorkStandardRow | null
}

export function WorkStandardsForm({ open, onClose, editRow }: Props) {
  const isEdit = editRow !== null
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [code, setCode] = useState(editRow?.code ?? "")
  const [name, setName] = useState(editRow?.name ?? "")
  const [docType, setDocType] = useState<string>(editRow?.docType ?? "SOP")
  const [fileUrl, setFileUrl] = useState(editRow?.fileUrl ?? "")

  function handleClose() {
    setError(null)
    onClose()
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      try {
        if (isEdit) {
          await updateWorkStandard(editRow.id, {
            name,
            docType,
            fileUrl: fileUrl.trim() || undefined,
          })
        } else {
          await createWorkStandard({
            code,
            name,
            docType,
            fileUrl: fileUrl.trim() || undefined,
          })
        }
        handleClose()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "오류가 발생했습니다.")
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <SheetContent className="w-[420px] sm:max-w-[420px] flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? "표준서 수정" : "표준서 등록"}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-5 py-6 overflow-y-auto">
          {!isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="code" className="text-[14px]">
                문서코드 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="예: WS-001"
                className="text-[14px]"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-[14px]">
              표준서명 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="표준서 명칭 입력"
              className="text-[14px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="docType" className="text-[14px]">
              문서유형 <span className="text-red-500">*</span>
            </Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger id="docType" className="text-[14px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOC_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-[14px]">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fileUrl" className="text-[14px]">파일 URL (선택)</Label>
            <Input
              id="fileUrl"
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              placeholder="https://..."
              className="text-[14px]"
            />
            <p className="text-[13px] text-muted-foreground">
              파일이 저장된 경로나 외부 URL을 입력하세요.
            </p>
          </div>

          {error && (
            <p className="text-[14px] text-red-500 bg-red-50 rounded-md px-3 py-2">{error}</p>
          )}
        </div>

        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isPending} className="flex-1">
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={isPending} className="flex-1">
            {isPending ? "저장 중..." : isEdit ? "수정" : "등록"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
