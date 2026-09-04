"use client"

import { useEffect, useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Trash2 } from "lucide-react"
import { useUserRole } from "@/lib/contexts/user-role-context"
import { getBackupGroupDetail, deleteBackupGroup, hideBackup, type BackupGroupDetail, type SupabaseBackupItem } from "@/lib/actions/backup.actions"
import { BackupGroupFormSheet } from "./backup-group-form-sheet"

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: "완료",
  PENDING: "진행중",
  FAILED: "실패",
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface BackupGroupDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string | null
  visibleBackups: SupabaseBackupItem[]
  onChanged: () => void
}

export function BackupGroupDetailSheet({ open, onOpenChange, groupId, visibleBackups, onChanged }: BackupGroupDetailSheetProps) {
  const role = useUserRole()
  const canMutate = role !== "VIEWER"

  const [detail, setDetail] = useState<BackupGroupDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => {
    if (!open || !groupId) return
    setLoading(true)
    getBackupGroupDetail(groupId)
      .then(setDetail)
      .finally(() => setLoading(false))
  }, [open, groupId])

  if (!open || !groupId) return null

  async function handleDeleteGroup() {
    if (!confirm("이 그룹을 삭제하시겠습니까?")) return
    const res = await deleteBackupGroup(groupId!)
    if (!res.ok) {
      alert(res.error ?? "삭제 중 오류가 발생했습니다.")
      return
    }
    onChanged()
    onOpenChange(false)
  }

  async function handleHideMember(externalBackupId: string) {
    if (!confirm("이 백업을 목록에서 삭제하시겠습니까?")) return
    const res = await hideBackup(externalBackupId)
    if (!res.ok) {
      alert(res.error ?? "처리 중 오류가 발생했습니다.")
      return
    }
    const refreshed = await getBackupGroupDetail(groupId!)
    setDetail(refreshed)
    onChanged()
  }

  function handleEditSaved() {
    onChanged()
    onOpenChange(false)
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>그룹 상세</SheetTitle>
            <SheetDescription>그룹에 포함된 백업 목록을 확인합니다.</SheetDescription>
          </SheetHeader>

          {loading && <p className="text-[14px] text-muted-foreground pt-4">불러오는 중...</p>}

          {!loading && detail && (
            <div className="space-y-5 pt-4">
              <div>
                <p className="text-[13px] text-muted-foreground">그룹명</p>
                <p className="text-[16px] font-medium">{detail.name}</p>
              </div>
              {detail.description && (
                <div>
                  <p className="text-[13px] text-muted-foreground">설명</p>
                  <p className="text-[14px]">{detail.description}</p>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-[13px] font-semibold text-muted-foreground">
                  포함 백업 ({detail.members.length}건)
                </p>
                {detail.members.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">포함된 백업이 없습니다.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {detail.members.map((m) => (
                      <li key={m.externalBackupId} className="flex items-center justify-between gap-2 text-[13px] border-b last:border-0 pb-1.5 last:pb-0">
                        <div className="min-w-0">
                          <p className="whitespace-nowrap">
                            {m.insertedAt ? fmtDateTime(m.insertedAt) : <span className="text-muted-foreground">확인 불가(원본 목록에 없음)</span>}
                            {m.hidden && <Badge className="ml-1.5 border-0 text-[10px] bg-slate-100 text-slate-600">숨김</Badge>}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {m.status ? (STATUS_LABEL[m.status] ?? m.status) : "-"} · {m.isPhysicalBackup === null ? "-" : m.isPhysicalBackup ? "물리" : "논리"}
                          </p>
                        </div>
                        {canMutate && !m.hidden && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:bg-red-50 shrink-0" onClick={() => handleHideMember(m.externalBackupId)} title="삭제">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="text-[12px] text-muted-foreground">
                등록: {detail.createdByName} · 최종수정: {detail.updatedByName} ({fmtDateTime(detail.updatedAt)})
              </div>
            </div>
          )}

          <SheetFooter className="pt-4 flex-row justify-between sm:justify-between">
            {canMutate ? (
              <div className="flex gap-2">
                <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={handleDeleteGroup}>삭제</Button>
                <Button variant="outline" onClick={() => setEditOpen(true)}>수정</Button>
              </div>
            ) : (
              <div />
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>닫기</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <BackupGroupFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        groupId={groupId}
        visibleBackups={visibleBackups}
        onSaved={handleEditSaved}
      />
    </>
  )
}
