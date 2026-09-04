"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FolderClosed, Plus, Trash2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useUserRole } from "@/lib/contexts/user-role-context"
import { hideBackup, type BackupManagementData, type SupabaseBackupItem } from "@/lib/actions/backup.actions"
import { BackupGroupFormSheet } from "./backup-group-form-sheet"
import { BackupGroupDetailSheet } from "./backup-group-detail-sheet"

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: "완료",
  PENDING: "진행중",
  FAILED: "실패",
}

function statusBadgeClass(status: string): string {
  if (status === "COMPLETED") return "bg-green-100 text-green-800"
  if (status === "FAILED") return "bg-red-100 text-red-700"
  return "bg-slate-100 text-slate-700"
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface BackupManagementClientProps {
  data: BackupManagementData
}

export function BackupManagementClient({ data }: BackupManagementClientProps) {
  const router = useRouter()
  const role = useUserRole()
  const canMutate = role !== "VIEWER"

  const [registerOpen, setRegisterOpen] = useState(false)
  const [detailGroupId, setDetailGroupId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  function openDetail(groupId: string) {
    setDetailGroupId(groupId)
    setDetailOpen(true)
  }

  async function handleHide(backup: SupabaseBackupItem) {
    if (!confirm("이 백업을 목록에서 삭제하시겠습니까?")) return
    const res = await hideBackup(backup.externalBackupId)
    if (!res.ok) {
      alert(res.error ?? "처리 중 오류가 발생했습니다.")
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {!data.available && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-center gap-2 text-[14px] text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          백업 정보를 불러올 수 없습니다.
        </div>
      )}

      {/* 상단 현황 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="전체 백업 수" value={data.available ? `${data.summary.totalVisibleBackups}건` : "-"} />
        <SummaryCard label="그룹 수" value={`${data.summary.groupCount}개`} />
        <SummaryCard
          label="최근 백업일시"
          value={data.summary.mostRecentBackupAt ? fmtDateTime(data.summary.mostRecentBackupAt) : "-"}
        />
        <SummaryCard
          label="자동백업 상태"
          value={
            data.available && (data.summary.pitrEnabled !== null || data.summary.walgEnabled !== null)
              ? [data.summary.pitrEnabled ? "PITR 활성" : null, data.summary.walgEnabled ? "WAL-G 활성" : null]
                  .filter(Boolean)
                  .join(" · ") || "비활성"
              : "-"
          }
        />
      </div>

      {/* 그룹 목록 */}
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-medium text-foreground">
          백업 그룹 <span className="text-muted-foreground font-normal">({data.groups.length}개)</span>
        </p>
        {canMutate && (
          <Button size="sm" onClick={() => setRegisterOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            그룹 등록
          </Button>
        )}
      </div>

      {data.groups.length === 0 ? (
        <EmptyBox message="등록된 백업 그룹이 없습니다." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.groups.map((g) => (
            <button
              key={g.id}
              onClick={() => openDetail(g.id)}
              className="rounded-lg border bg-card p-4 text-left hover:border-primary/50 hover:shadow-sm transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-50 rounded-lg shrink-0">
                  <FolderClosed className="h-5 w-5 text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-foreground truncate">{g.name}</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">{g.memberCount}건 포함</p>
                  {g.description && <p className="text-[12px] text-muted-foreground mt-1 truncate">{g.description}</p>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 미분류 백업 */}
      <div className="space-y-3">
        <p className="text-[15px] font-medium text-foreground">
          미분류 <span className="text-muted-foreground font-normal">({data.unclassified.length}건)</span>
        </p>
        {!data.available ? (
          <EmptyBox message="백업 정보를 불러올 수 없습니다." />
        ) : data.unclassified.length === 0 ? (
          <EmptyBox message="미분류 백업이 없습니다." />
        ) : (
          <div className="rounded-lg border bg-card overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 px-4 font-medium">백업일시</th>
                  <th className="py-2 px-4 font-medium">상태</th>
                  <th className="py-2 px-4 font-medium">유형</th>
                  <th className="py-2 px-4 font-medium">작업</th>
                </tr>
              </thead>
              <tbody>
                {data.unclassified.map((b) => (
                  <tr key={b.externalBackupId} className="border-b last:border-0">
                    <td className="py-2 px-4 whitespace-nowrap">{fmtDateTime(b.insertedAt)}</td>
                    <td className="py-2 px-4">
                      <Badge className={`border-0 text-[11px] ${statusBadgeClass(b.status)}`}>
                        {STATUS_LABEL[b.status] ?? b.status}
                      </Badge>
                    </td>
                    <td className="py-2 px-4">{b.isPhysicalBackup === null ? "-" : b.isPhysicalBackup ? "물리" : "논리"}</td>
                    <td className="py-2 px-4">
                      {canMutate && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:bg-red-50" onClick={() => handleHide(b)} title="삭제">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BackupGroupFormSheet
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        mode="create"
        visibleBackups={data.visibleBackups}
        onSaved={() => router.refresh()}
      />

      <BackupGroupDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        groupId={detailGroupId}
        visibleBackups={data.visibleBackups}
        onChanged={() => router.refresh()}
      />
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-[20px] font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function EmptyBox({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-8 rounded-md border border-dashed text-[13px] text-muted-foreground">
      {message}
    </div>
  )
}
