"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserRole, PermissionAction } from "@prisma/client"
import { Lock, Shield, ChevronDown } from "lucide-react"

import { PermissionMatrix, updatePermission } from "@/lib/actions/permission.actions"
import { Switch } from "@/components/ui/switch"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"

const RESOURCE_LABELS: Record<string, string> = {
  PRODUCTION_PLAN: "생산계획",
  WORK_ORDER: "작업지시",
  ITEM: "품목",
  BOM: "BOM",
  ROUTING: "공정/라우팅",
  INVENTORY: "재고",
  QUALITY_INSPECTION: "품질검사",
  EQUIPMENT: "설비",
  COMMON_CODE: "공통코드",
  USER_MANAGEMENT: "사용자관리",
  AUDIT_LOG: "감사로그",
  APPROVAL: "결재",
  REPORT: "보고서",
}

const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: "오너",
  ADMIN: "관리자",
  MANAGER: "매니저",
  OPERATOR: "작업자",
  VIEWER: "조회자",
}

const ROLE_DESC: Record<UserRole, string> = {
  OWNER: "모든 권한 보유",
  ADMIN: "시스템 전반 관리",
  MANAGER: "업무 관리 및 승인",
  OPERATOR: "현장 작업 수행",
  VIEWER: "조회 전용",
}

const ACTION_LABELS: Record<PermissionAction, string> = {
  READ: "조회",
  CREATE: "생성",
  UPDATE: "수정",
  DELETE: "삭제",
  APPROVE: "승인",
  EXPORT: "내보내기",
}

const ACTION_CONFIG: Record<PermissionAction, { label: string; color: string; dot: string; badge: string }> = {
  READ:    { label: "조회",      color: "text-blue-600",   dot: "bg-blue-500",    badge: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800" },
  CREATE:  { label: "생성",      color: "text-emerald-600",dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800" },
  UPDATE:  { label: "수정",      color: "text-amber-600",  dot: "bg-amber-500",   badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800" },
  DELETE:  { label: "삭제",      color: "text-red-600",    dot: "bg-red-500",     badge: "bg-red-50 text-red-600 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800" },
  APPROVE: { label: "승인",      color: "text-purple-600", dot: "bg-purple-500",  badge: "bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800" },
  EXPORT:  { label: "내보내기",  color: "text-teal-600",   dot: "bg-teal-500",    badge: "bg-teal-50 text-teal-600 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800" },
}

const ROLES: UserRole[] = ["OWNER", "ADMIN", "MANAGER", "OPERATOR", "VIEWER"]
const ACTIONS: PermissionAction[] = ["READ", "CREATE", "UPDATE", "DELETE", "APPROVE", "EXPORT"]

type PermCellData = { id: string; isAllowed: boolean } | undefined
type RolePerms = Partial<Record<PermissionAction, PermCellData>>

// ─── 개별 셀 컴포넌트 ────────────────────────────────────────────────────────

function OwnerCell({ perms }: { perms: RolePerms }) {
  return (
    <div className="flex flex-col items-center gap-2 px-2 py-2.5">
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Lock className="w-3 h-3" />
        <span className="font-medium">잠금</span>
      </div>
      <div className="flex flex-wrap gap-1 justify-center">
        {ACTIONS.map((action) => {
          const perm = perms[action]
          if (!perm) return null
          return (
            <span
              key={action}
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border ${ACTION_CONFIG[action].badge}`}
            >
              {ACTION_CONFIG[action].label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function EditableCell({
  resource,
  role,
  perms,
}: {
  resource: string
  role: UserRole
  perms: RolePerms
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const allowedActions = ACTIONS.filter((a) => perms[a]?.isAllowed)

  const handleToggle = (id: string, checked: boolean) => {
    startTransition(async () => {
      await updatePermission(id, checked)
      router.refresh()
    })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          disabled={isPending}
          className="w-full rounded-lg px-2 py-2.5 hover:bg-muted/50 active:bg-muted/70 transition-colors group min-h-[64px] flex flex-col items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isPending ? (
            <span className="text-[12px] text-muted-foreground animate-pulse">저장 중...</span>
          ) : allowedActions.length === 0 ? (
            <span className="text-[13px] text-muted-foreground/50 italic">없음</span>
          ) : (
            <div className="flex flex-wrap gap-1 justify-center">
              {ACTIONS.map((action) => {
                const perm = perms[action]
                if (!perm) return null
                return (
                  <span
                    key={action}
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border transition-opacity ${
                      perm.isAllowed
                        ? ACTION_CONFIG[action].badge
                        : "opacity-0 pointer-events-none"
                    }`}
                  >
                    {ACTION_CONFIG[action].label}
                  </span>
                )
              })}
            </div>
          )}
          <ChevronDown className="w-3 h-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-52 p-0 shadow-lg" align="center" sideOffset={4}>
        {/* 헤더 */}
        <div className="px-4 py-3 bg-muted/30 rounded-t-lg border-b">
          <p className="text-[13px] font-semibold leading-tight">
            {RESOURCE_LABELS[resource] ?? resource}
          </p>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {ROLE_LABELS[role]} 권한 설정
          </p>
        </div>

        {/* 액션 토글 리스트 */}
        <div className="py-1.5 px-1">
          {ACTIONS.map((action, i) => {
            const perm = perms[action]
            if (!perm) return null
            return (
              <div key={action}>
                {i > 0 && i % 3 === 0 && (
                  <Separator className="my-1.5 mx-3" />
                )}
                <label className="flex items-center justify-between gap-3 px-3 py-2 rounded-md hover:bg-muted/40 cursor-pointer transition-colors">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${ACTION_CONFIG[action].dot}`} />
                    <span className="text-[14px]">{ACTION_LABELS[action]}</span>
                  </div>
                  <Switch
                    checked={perm.isAllowed}
                    disabled={isPending}
                    onCheckedChange={(checked) => handleToggle(perm.id, checked)}
                  />
                </label>
              </div>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── 메인 테이블 ─────────────────────────────────────────────────────────────

type Props = {
  matrix: PermissionMatrix
  tenantId: string
}

export function PermissionMatrixTable({ matrix, tenantId }: Props) {
  const resources = Object.keys(RESOURCE_LABELS).filter((r) => matrix[r])

  if (resources.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 border rounded-xl text-[14px] text-muted-foreground">
        등록된 권한 데이터가 없습니다. 시드 데이터를 먼저 실행하세요.
      </div>
    )
  }

  return (
    <div className="border rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b bg-muted/30">
              {/* 리소스 헤더 */}
              <th className="text-left px-5 py-4 w-36 sticky left-0 bg-muted/30 z-10">
                <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-widest">
                  리소스
                </span>
              </th>

              {/* 역할 헤더 */}
              {ROLES.map((role) => (
                <th key={role} className="px-4 py-4 text-center min-w-[190px]">
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1.5">
                      {role === "OWNER" && <Shield className="w-3.5 h-3.5 text-foreground/60" />}
                      <span className="text-[14px] font-semibold">{ROLE_LABELS[role]}</span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{ROLE_DESC[role]}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {resources.map((resource, idx) => (
              <tr
                key={resource}
                className={`border-b last:border-0 transition-colors ${
                  idx % 2 === 0 ? "bg-background" : "bg-muted/[0.03]"
                } hover:bg-muted/10`}
              >
                {/* 리소스 이름 */}
                <td className="px-5 py-1.5 sticky left-0 bg-inherit z-10 border-r">
                  <span className="text-[14px] font-medium">
                    {RESOURCE_LABELS[resource] ?? resource}
                  </span>
                </td>

                {/* 역할별 권한 셀 */}
                {ROLES.map((role) => {
                  const rolePerms = matrix[resource]?.[role] ?? {}
                  return (
                    <td
                      key={role}
                      className="px-2 py-1.5 border-r last:border-r-0 align-middle"
                    >
                      {role === "OWNER" ? (
                        <OwnerCell perms={rolePerms as RolePerms} />
                      ) : (
                        <EditableCell
                          resource={resource}
                          role={role}
                          perms={rolePerms as RolePerms}
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div className="px-5 py-3 border-t bg-muted/20 flex items-center gap-4 flex-wrap">
        <span className="text-[12px] text-muted-foreground font-medium">권한 종류</span>
        {ACTIONS.map((action) => (
          <div key={action} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${ACTION_CONFIG[action].dot}`} />
            <span className="text-[12px] text-muted-foreground">{ACTION_CONFIG[action].label}</span>
          </div>
        ))}
        <span className="ml-auto text-[12px] text-muted-foreground italic">
          셀을 클릭하면 권한을 변경할 수 있습니다
        </span>
      </div>
    </div>
  )
}
