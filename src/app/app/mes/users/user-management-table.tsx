"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserRole } from "@prisma/client"
import { Shield, UserCheck, UserX, ChevronDown, Trash2, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  updateUserRole,
  deactivateUser,
  reactivateUser,
  deleteUserPermanently,
  resetUserPassword,
} from "@/lib/actions/user-management.actions"
import type { TenantUserRow } from "@/lib/actions/user-management.actions"

type UserFilter = "ACTIVE" | "ALL" | "INACTIVE"

const FILTER_OPTIONS: { label: string; value: UserFilter }[] = [
  { label: "활성 사용자", value: "ACTIVE" },
  { label: "비활성/퇴사 포함", value: "ALL" },
  { label: "비활성/퇴사만", value: "INACTIVE" },
]

// ─── Constants ────────────────────────────────────────────────────────────────

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

const ROLE_COLORS: Record<UserRole, string> = {
  OWNER:    "bg-purple-50 text-purple-700 border-purple-200",
  ADMIN:    "bg-blue-50 text-blue-700 border-blue-200",
  MANAGER:  "bg-amber-50 text-amber-700 border-amber-200",
  OPERATOR: "bg-emerald-50 text-emerald-700 border-emerald-200",
  VIEWER:   "bg-slate-50 text-slate-600 border-slate-200",
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UserManagementTable({
  users,
  currentUserId,
  canResetPassword = false,
}: {
  users: TenantUserRow[]
  currentUserId: string
  canResetPassword?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<UserFilter>("ACTIVE")

  // OWNER 계정은 일반 사용자 목록에 표시하지 않음 (관리자·매니저·작업자·조회자만 표시)
  const nonOwnerUsers = useMemo(() => users.filter((u) => u.role !== "OWNER"), [users])

  const filteredUsers = useMemo(() => {
    if (filter === "ACTIVE") return nonOwnerUsers.filter((u) => u.isActive)
    if (filter === "INACTIVE") return nonOwnerUsers.filter((u) => !u.isActive)
    return nonOwnerUsers
  }, [nonOwnerUsers, filter])

  const activeCount = useMemo(() => nonOwnerUsers.filter((u) => u.isActive).length, [nonOwnerUsers])
  const inactiveCount = nonOwnerUsers.length - activeCount

  function handleDeletePermanently(tenantUserId: string) {
    if (
      !confirm(
        "영구삭제는 복구할 수 없습니다. 단, 업무 이력이 있는 사용자는 삭제되지 않습니다.\n\n계속하시겠습니까?",
      )
    )
      return
    setError(null)
    startTransition(async () => {
      const result = await deleteUserPermanently(tenantUserId)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? "영구삭제에 실패했습니다.")
      }
    })
  }

  function handleRoleChange(tenantUserId: string, newRole: UserRole) {
    setError(null)
    startTransition(async () => {
      const result = await updateUserRole(tenantUserId, newRole)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? "역할 변경에 실패했습니다.")
      }
    })
  }

  function handleDeactivate(tenantUserId: string) {
    if (
      !confirm(
        "퇴사처리 시 로그인할 수 없으며 기본 사용자 목록에서 숨겨집니다. 기존 업무 이력은 유지됩니다.\n\n계속하시겠습니까?",
      )
    )
      return
    setError(null)
    startTransition(async () => {
      const result = await deactivateUser(tenantUserId)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? "비활성화에 실패했습니다.")
      }
    })
  }

  function handleReactivate(tenantUserId: string) {
    setError(null)
    startTransition(async () => {
      const result = await reactivateUser(tenantUserId)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? "재활성화에 실패했습니다.")
      }
    })
  }

  function handleResetPassword(tenantUserId: string, userName: string) {
    if (
      !confirm(
        `${userName} 계정의 비밀번호를 초기화합니다.\n초기화된 비밀번호: Cns@123\n\n해당 계정은 다음 로그인 시 비밀번호를 변경해야 합니다.\n\n계속하시겠습니까?`,
      )
    )
      return
    setError(null)
    startTransition(async () => {
      const result = await resetUserPassword(tenantUserId)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? "비밀번호 초기화에 실패했습니다.")
      }
    })
  }

  return (
    <>
      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {FILTER_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            type="button"
            size="sm"
            variant={filter === opt.value ? "default" : "outline"}
            className="h-8 text-[13px]"
            onClick={() => setFilter(opt.value)}
          >
            {opt.label}
            {opt.value === "ACTIVE" && ` (${activeCount})`}
            {opt.value === "INACTIVE" && ` (${inactiveCount})`}
          </Button>
        ))}
      </div>

      {filteredUsers.length === 0 ? (
        <div className="flex items-center justify-center h-48 border rounded-xl text-[14px] text-muted-foreground">
          {filter === "ACTIVE"
            ? "활성 사용자가 없습니다."
            : filter === "INACTIVE"
              ? "비활성/퇴사 사용자가 없습니다."
              : "등록된 사용자가 없습니다."}
        </div>
      ) : (
      <div className="border rounded-xl overflow-hidden shadow-sm">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-5 py-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">이름</th>
              <th className="text-left px-5 py-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">아이디</th>
              <th className="text-left px-5 py-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">이메일</th>
              <th className="text-left px-5 py-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">부서 / 직급</th>
              <th className="text-left px-5 py-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">역할</th>
              <th className="text-left px-5 py-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">상태</th>
              <th className="text-left px-5 py-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">등록일</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user, idx) => {
              const isSelf = user.profileId === currentUserId
              const isOwner = user.role === "OWNER"

              return (
                <tr
                  key={user.profileId}
                  className={`border-b last:border-0 transition-colors ${
                    !user.isActive
                      ? "opacity-50"
                      : idx % 2 === 0
                      ? "bg-background"
                      : "bg-muted/[0.03]"
                  } hover:bg-muted/10`}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium">{user.name || "—"}</span>
                      {isSelf && (
                        <span className="text-[11px] bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5">나</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-[14px] font-mono text-muted-foreground">
                    {user.loginId ?? <span className="text-[12px] italic text-muted-foreground/40">없음</span>}
                  </td>
                  <td className="px-5 py-3 text-[14px] text-muted-foreground">{user.email}</td>
                  <td className="px-5 py-3 text-[14px] text-muted-foreground">
                    <span>{user.department ?? "—"}</span>
                    {user.jobTitle && (
                      <span className="ml-1 text-[12px] text-muted-foreground/70">/ {user.jobTitle}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[12px] font-medium border ${ROLE_COLORS[user.role]}`}>
                      {isOwner && <Shield className="w-3 h-3" />}
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={user.isActive ? "default" : "secondary"} className="text-[12px]">
                      {user.isActive ? "활성" : "비활성"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-5 py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[12px]"
                          disabled={isPending}
                        >
                          관리 <ChevronDown className="w-3 h-3 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuLabel className="text-[12px]">역할 변경</DropdownMenuLabel>
                        {ROLE_OPTIONS.map((opt) => (
                          <DropdownMenuItem
                            key={opt.value}
                            className={`text-[13px] ${user.role === opt.value ? "font-semibold text-primary" : ""}`}
                            disabled={user.role === opt.value}
                            onClick={() => handleRoleChange(user.id, opt.value)}
                          >
                            {opt.label}
                            {user.role === opt.value && " ✓"}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        {user.isActive ? (
                          <DropdownMenuItem
                            className="text-[13px] text-destructive focus:text-destructive"
                            disabled={isSelf || isOwner}
                            onClick={() => handleDeactivate(user.id)}
                          >
                            <UserX className="w-3.5 h-3.5 mr-1.5" />
                            퇴사처리 (목록에서 숨김)
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            className="text-[13px] text-emerald-600 focus:text-emerald-600"
                            onClick={() => handleReactivate(user.id)}
                          >
                            <UserCheck className="w-3.5 h-3.5 mr-1.5" />
                            재활성화
                          </DropdownMenuItem>
                        )}
                        {canResetPassword && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-[13px] text-amber-600 focus:text-amber-600"
                              disabled={isSelf}
                              onClick={() => handleResetPassword(user.id, user.name)}
                            >
                              <KeyRound className="w-3.5 h-3.5 mr-1.5" />
                              비밀번호 초기화
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-[13px] text-destructive focus:text-destructive"
                          disabled={isSelf || isOwner}
                          onClick={() => handleDeletePermanently(user.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                          영구삭제
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}

      {error && (
        <p className="text-[13px] text-destructive bg-destructive/10 rounded-lg px-4 py-2 mt-2">
          {error}
        </p>
      )}

    </>
  )
}
