"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserRole } from "@prisma/client"
import { Shield, UserCheck, UserX, ChevronDown } from "lucide-react"
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
import { updateUserRole, deactivateUser, reactivateUser } from "@/lib/actions/user-management.actions"
import type { TenantUserRow } from "@/lib/actions/user-management.actions"

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
}: {
  users: TenantUserRow[]
  currentUserId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleRoleChange(tenantUserId: string, newRole: UserRole) {
    setError(null)
    startTransition(async () => {
      try {
        await updateUserRole(tenantUserId, newRole)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "역할 변경에 실패했습니다.")
      }
    })
  }

  function handleDeactivate(tenantUserId: string) {
    if (!confirm("이 사용자를 비활성화하시겠습니까?")) return
    setError(null)
    startTransition(async () => {
      try {
        await deactivateUser(tenantUserId)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "비활성화에 실패했습니다.")
      }
    })
  }

  function handleReactivate(tenantUserId: string) {
    setError(null)
    startTransition(async () => {
      try {
        await reactivateUser(tenantUserId)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "재활성화에 실패했습니다.")
      }
    })
  }

  if (users.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 border rounded-xl text-[14px] text-muted-foreground">
        등록된 사용자가 없습니다.
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
              <th className="text-left px-5 py-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">역할</th>
              <th className="text-left px-5 py-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">상태</th>
              <th className="text-left px-5 py-3 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">등록일</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, idx) => {
              const isSelf = user.profileId === currentUserId
              const isOwner = user.role === "OWNER"

              return (
                <tr
                  key={user.id}
                  className={`border-b last:border-0 transition-colors ${
                    !user.isActive ? "opacity-50" : idx % 2 === 0 ? "bg-background" : "bg-muted/[0.03]"
                  } hover:bg-muted/10`}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium">{user.name}</span>
                      {isSelf && (
                        <span className="text-[11px] bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5">나</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-[14px] text-muted-foreground">{user.email}</td>
                  <td className="px-5 py-3 text-[14px] text-muted-foreground">{user.department ?? "—"}</td>
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
                            비활성화
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
                      </DropdownMenuContent>
                    </DropdownMenu>
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
    </>
  )
}
