"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Trash2, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"

import {
  CodeGroupWithCodes,
  createCommonCode,
  updateCommonCode,
  deleteCommonCode,
  toggleCodeActive,
} from "@/lib/actions/common-code.actions"

type CommonCodeRow = CodeGroupWithCodes["codes"][number]

type CodeFormState = {
  code: string
  name: string
  description: string
  displayOrder: string
  isActive: boolean
}

const EMPTY_CODE_FORM: CodeFormState = {
  code: "",
  name: "",
  description: "",
  displayOrder: "0",
  isActive: true,
}

export function CodeDetailPanel({ group }: { group: CodeGroupWithCodes }) {
  const router = useRouter()
  const [showDialog, setShowDialog] = useState(false)
  const [editingCode, setEditingCode] = useState<CommonCodeRow | null>(null)
  const [form, setForm] = useState<CodeFormState>(EMPTY_CODE_FORM)
  const [saving, setSaving] = useState(false)

  function openCreate() {
    setEditingCode(null)
    setForm({ ...EMPTY_CODE_FORM, displayOrder: String(group.codes.length * 10 + 10) })
    setShowDialog(true)
  }

  function openEdit(code: CommonCodeRow) {
    setEditingCode(code)
    setForm({
      code: code.code,
      name: code.name,
      description: code.description ?? "",
      displayOrder: String(code.displayOrder),
      isActive: code.isActive,
    })
    setShowDialog(true)
  }

  async function handleSave() {
    if (!form.code.trim() || !form.name.trim()) return
    setSaving(true)
    try {
      const order = parseInt(form.displayOrder, 10)
      if (editingCode) {
        await updateCommonCode(editingCode.id, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          displayOrder: isNaN(order) ? 0 : order,
          isActive: form.isActive,
        })
      } else {
        await createCommonCode({
          groupId: group.id,
          code: form.code.trim(),
          name: form.name.trim(),
          description: form.description.trim() || null,
          displayOrder: isNaN(order) ? 0 : order,
          isActive: form.isActive,
        })
      }
      setShowDialog(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 코드를 삭제하시겠습니까?")) return
    try {
      await deleteCommonCode(id)
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 중 오류가 발생했습니다.")
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    try {
      await toggleCodeActive(id, isActive)
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : "상태 변경 중 오류가 발생했습니다.")
    }
  }

  return (
    <>
      <div className="flex flex-col h-full border rounded-lg bg-background">
        {/* 패널 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h2 className="text-[15px] font-semibold">{group.groupName}</h2>
            <p className="text-[12px] text-muted-foreground font-mono">{group.groupCode}</p>
          </div>
          <Button size="sm" onClick={openCreate} className="h-8 text-[13px]">
            <Plus className="h-3 w-3 mr-1" />
            코드 추가
          </Button>
        </div>

        {/* 테이블 */}
        <div className="flex-1 overflow-auto">
          {group.codes.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-[14px] text-muted-foreground">
              등록된 코드가 없습니다. 코드를 추가하세요.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-14 text-center text-[13px]">순서</TableHead>
                  <TableHead className="w-32 text-[13px]">코드</TableHead>
                  <TableHead className="text-[13px]">코드명</TableHead>
                  <TableHead className="text-[13px]">설명</TableHead>
                  <TableHead className="w-16 text-center text-[13px]">활성</TableHead>
                  <TableHead className="w-20 text-[13px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.codes.map((code) => (
                  <TableRow key={code.id} className="group/row">
                    <TableCell className="text-center text-[14px] tabular-nums">
                      {code.displayOrder}
                    </TableCell>
                    <TableCell className="font-mono text-[13px]">{code.code}</TableCell>
                    <TableCell className="text-[14px]">{code.name}</TableCell>
                    <TableCell className="text-[13px] text-muted-foreground max-w-[200px] truncate">
                      {code.description}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={code.isActive}
                        onCheckedChange={(checked) => handleToggle(code.id, checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-0.5 justify-end opacity-0 group-hover/row:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(code)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(code.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* 코드 추가/수정 Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[18px]">
              {editingCode ? "코드 수정" : "코드 추가"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-[14px]">
                코드 <span className="text-destructive">*</span>
              </Label>
              <Input
                className="text-[14px] font-mono"
                placeholder="예: RAW_MATERIAL"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                disabled={!!editingCode}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[14px]">
                코드명 <span className="text-destructive">*</span>
              </Label>
              <Input
                className="text-[14px]"
                placeholder="예: 원자재"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[14px]">설명</Label>
              <Textarea
                className="text-[14px] resize-none"
                placeholder="코드에 대한 설명을 입력하세요"
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[14px]">표시 순서</Label>
                <Input
                  className="text-[14px]"
                  type="number"
                  min={0}
                  value={form.displayOrder}
                  onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[14px]">활성 여부</Label>
                <div className="flex items-center h-9">
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
                  />
                  <span className="ml-2 text-[14px] text-muted-foreground">
                    {form.isActive ? "활성" : "비활성"}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>
              취소
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.code.trim() || !form.name.trim()}
            >
              {saving ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
