"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserRole, SignupRequestStatus } from "@prisma/client"
import { CheckCircle, XCircle, Clock, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { approveSignupRequest, rejectSignupRequest } from "@/lib/actions/signup-request.actions"
import type { SignupRequestRow } from "@/lib/actions/signup-request.actions"
import { Copy, Check } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

const ROLE_OPTIONS: { label: string; value: UserRole }[] = [
  { label: "오너", value: "OWNER" },
  { label: "관리자", value: "ADMIN" },
  { label: "매니저", value: "MANAGER" },
  { label: "작업자", value: "OPERATOR" },
  { label: "조회자", value: "VIEWER" },
]

const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: "오너",
  ADMIN: "관리자",
  MANAGER: "매니저",
  OPERATOR: "작업자",
  VIEWER: "조회자",
}

const STATUS_CONFIG: Record<
  SignupRequestStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }
> = {
  PENDING:  { label: "대기중",  variant: "outline",     icon: <Clock className="w-3 h-3" /> },
  APPROVED: { label: "승인됨",  variant: "default",     icon: <CheckCircle className="w-3 h-3" /> },
  REJECTED: { label: "거절됨",  variant: "destructive", icon: <XCircle className="w-3 h-3" /> },
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SignupRequestsTable({ requests }: { requests: SignupRequestRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // 승인 다이얼로그
  const [approveTarget, setApproveTarget] = useState<SignupRequestRow | null>(null)
  const [grantedRole, setGrantedRole] = useState<UserRole>("OPERATOR")

  // 거절 다이얼로그
  const [rejectTarget, setRejectTarget] = useState<SignupRequestRow | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  const [error, setError] = useState<string | null>(null)
  const [approvedPassword, setApprovedPassword] = useState<string | null>(null)

  function handleApprove() {
    if (!approveTarget) return
    setError(null)
    startTransition(async () => {
      const result = await approveSignupRequest(approveTarget.id, grantedRole)
      if (result.success) {
        setApproveTarget(null)
        setApprovedPassword(result.tempPassword ?? null)
        router.refresh()
      } else {
        setError(result.error ?? "오류가 발생했습니다.")
      }
    })
  }

  function handleReject() {
    if (!rejectTarget || !rejectReason.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await rejectSignupRequest(rejectTarget.id, rejectReason.trim())
      if (result.success) {
        setRejectTarget(null)
        setRejectReason("")
        router.refresh()
      } else {
        setError(result.error ?? "오류가 발생했습니다.")
      }
    })
  }

  if (requests.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 border rounded-xl text-[14px] text-muted-foreground">
        가입 신청이 없습니다.
      </div>
    )
  }

  return (
    <>
      <div className="border rounded-xl overflow-hidden shadow-sm">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-5 py-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">이름</th>
              <th className="text-left px-5 py-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">이메일</th>
              <th className="text-left px-5 py-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">부서</th>
              <th className="text-left px-5 py-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">요청 역할</th>
              <th className="text-left px-5 py-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">상태</th>
              <th className="text-left px-5 py-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">신청일</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((req, idx) => {
              const statusCfg = STATUS_CONFIG[req.status]
              return (
                <tr
                  key={req.id}
                  className={`border-b last:border-0 transition-colors ${
                    idx % 2 === 0 ? "bg-background" : "bg-muted/[0.03]"
                  } hover:bg-muted/10`}
                >
                  <td className="px-5 py-3 text-[14px] font-medium">{req.name}</td>
                  <td className="px-5 py-3 text-[14px] text-muted-foreground">{req.email}</td>
                  <td className="px-5 py-3 text-[14px] text-muted-foreground">{req.department ?? "—"}</td>
                  <td className="px-5 py-3">
                    <span className="text-[13px] text-muted-foreground">
                      {ROLE_LABELS[req.requestedRole]}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={statusCfg.variant} className="flex items-center gap-1 w-fit text-[12px]">
                      {statusCfg.icon}
                      {statusCfg.label}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-muted-foreground">
                    {new Date(req.createdAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-5 py-3">
                    {req.status === "PENDING" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-[12px]"
                          disabled={isPending}
                          onClick={() => {
                            setGrantedRole(req.requestedRole)
                            setApproveTarget(req)
                          }}
                        >
                          승인
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[12px] text-destructive border-destructive/30 hover:bg-destructive/10"
                          disabled={isPending}
                          onClick={() => {
                            setRejectReason("")
                            setRejectTarget(req)
                          }}
                        >
                          거절
                        </Button>
                      </div>
                    )}
                    {req.status === "APPROVED" && (
                      <span className="text-[12px] text-muted-foreground">
                        승인: {req.approvedBy?.name ?? "—"}
                      </span>
                    )}
                    {req.status === "REJECTED" && req.rejectReason && (
                      <span className="text-[12px] text-muted-foreground truncate max-w-[160px] block" title={req.rejectReason}>
                        사유: {req.rejectReason}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {error && (
        <p className="text-[13px] text-destructive bg-destructive/10 rounded-lg px-4 py-2 mt-2">
          {error}
        </p>
      )}

      {/* 승인 다이얼로그 */}
      <Dialog open={!!approveTarget} onOpenChange={(v) => !v && setApproveTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>가입 신청 승인</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/40 px-4 py-3 space-y-1">
              <p className="text-[14px] font-medium">{approveTarget?.name}</p>
              <p className="text-[13px] text-muted-foreground">{approveTarget?.email}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">부여할 역할</Label>
              <Select value={grantedRole} onValueChange={(v) => setGrantedRole(v as UserRole)}>
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-[13px]">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[12px] text-muted-foreground">
              승인 시 이메일 발송 없이 계정이 즉시 생성됩니다. 임시 비밀번호를 사용자에게 직접 전달하세요.
            </p>
            {error && (
              <p className="text-[12px] text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)} disabled={isPending}>
              취소
            </Button>
            <Button onClick={handleApprove} disabled={isPending}>
              {isPending ? "처리 중..." : "승인 확정"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 임시 비밀번호 표시 다이얼로그 (승인 후) */}
      <TempPasswordDialog
        password={approvedPassword}
        onClose={() => setApprovedPassword(null)}
      />

      {/* 거절 다이얼로그 */}
      <Dialog open={!!rejectTarget} onOpenChange={(v) => !v && setRejectTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>가입 신청 거절</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/40 px-4 py-3 space-y-1">
              <p className="text-[14px] font-medium">{rejectTarget?.name}</p>
              <p className="text-[13px] text-muted-foreground">{rejectTarget?.email}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">거절 사유 <span className="text-destructive">*</span></Label>
              <Textarea
                placeholder="거절 사유를 입력하세요"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="resize-none text-[13px]"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)} disabled={isPending}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isPending || !rejectReason.trim()}
            >
              {isPending ? "처리 중..." : "거절 확정"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── 임시 비밀번호 표시 다이얼로그 ───────────────────────────────────────────

function TempPasswordDialog({
  password,
  onClose,
}: {
  password: string | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    if (!password) return
    navigator.clipboard.writeText(password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={!!password} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>계정 생성 완료</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-[14px] text-muted-foreground">
            계정이 생성되었습니다. 아래 임시 비밀번호를 사용자에게 직접 전달하세요.
          </p>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3">
            <code className="flex-1 text-[15px] font-mono font-semibold tracking-wider">
              {password}
            </code>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 shrink-0"
              onClick={handleCopy}
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-[12px] text-destructive">
            이 창을 닫으면 비밀번호를 다시 확인할 수 없습니다.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>확인</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
