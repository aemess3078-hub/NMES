"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserRole, PermissionAction } from "@prisma/client"

import { PermissionMatrix, updatePermission } from "@/lib/actions/permission.actions"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"

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

const ACTION_LABELS: Record<PermissionAction, string> = {
  READ: "조회",
  CREATE: "생성",
  UPDATE: "수정",
  DELETE: "삭제",
  APPROVE: "승인",
  EXPORT: "내보내기",
}

const ROLES: UserRole[] = ["OWNER", "ADMIN", "MANAGER", "OPERATOR", "VIEWER"]
const ACTIONS: PermissionAction[] = ["READ", "CREATE", "UPDATE", "DELETE", "APPROVE", "EXPORT"]

type Props = {
  matrix: PermissionMatrix
  tenantId: string
}

export function PermissionMatrixTable({ matrix, tenantId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // 실제 DB에 존재하는 리소스만 표시 (정의된 순서 유지)
  const resources = Object.keys(RESOURCE_LABELS).filter((r) => matrix[r])

  const handleToggle = (id: string, isAllowed: boolean) => {
    startTransition(async () => {
      await updatePermission(id, isAllowed)
      router.refresh()
    })
  }

  if (resources.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 border rounded-lg text-[14px] text-muted-foreground">
        등록된 권한 데이터가 없습니다. 시드 데이터를 먼저 실행하세요.
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="text-left px-4 py-3 font-semibold text-[13px] w-36 sticky left-0 bg-muted/30">
              리소스
            </th>
            {ROLES.map((role) => (
              <th key={role} className="px-4 py-3 text-center min-w-[180px]">
                <Badge
                  variant={role === "OWNER" ? "default" : "secondary"}
                  className="text-[12px]"
                >
                  {ROLE_LABELS[role]}
                </Badge>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {resources.map((resource, idx) => (
            <tr
              key={resource}
              className={idx % 2 === 0 ? "bg-background hover:bg-muted/20" : "bg-muted/10 hover:bg-muted/30"}
            >
              <td className="px-4 py-3 font-medium text-[14px] sticky left-0 bg-inherit border-r">
                {RESOURCE_LABELS[resource] ?? resource}
              </td>
              {ROLES.map((role) => {
                const isOwner = role === "OWNER"
                return (
                  <td key={role} className="px-4 py-3">
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center">
                      {ACTIONS.map((action) => {
                        const perm = matrix[resource]?.[role]?.[action]
                        if (!perm) return null
                        return (
                          <div key={action} className="flex flex-col items-center gap-0.5 w-10">
                            <Checkbox
                              checked={perm.isAllowed}
                              disabled={isOwner || isPending}
                              onCheckedChange={(checked) => {
                                handleToggle(perm.id, !!checked)
                              }}
                              className={isOwner ? "opacity-60 cursor-not-allowed" : ""}
                            />
                            <span className="text-[11px] text-muted-foreground text-center leading-tight">
                              {ACTION_LABELS[action]}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {isPending && (
        <div className="px-4 py-2 border-t text-[13px] text-muted-foreground text-right">
          저장 중...
        </div>
      )}
    </div>
  )
}
