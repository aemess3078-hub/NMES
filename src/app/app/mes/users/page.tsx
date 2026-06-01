export const dynamic = "force-dynamic"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getPermissionMatrix } from "@/lib/actions/permission.actions"
import {
  getTenantUsers,
  getLoginHistory,
  getAuditLogs,
} from "@/lib/actions/user-management.actions"
import { getSignupRequests, getPendingSignupCount } from "@/lib/actions/signup-request.actions"
import { PermissionMatrixTable } from "./permission-matrix"
import { UserManagementTable } from "./user-management-table"
import { SignupRequestsTable } from "./signup-requests-table"
import { LoginHistoryTable } from "./login-history-table"
import { AuditLogTable } from "./audit-log-table"
import { cookies } from "next/headers"
import { getCurrentUser, requireRole } from "@/lib/auth"
import { canAccessFullUserManagement } from "@/lib/developer"

export default async function UsersPage() {
  // VIEWER 이상이면 사용자 목록 탭 접근 가능
  const currentUser = await requireRole("VIEWER")
  const fullAccess = canAccessFullUserManagement(currentUser)

  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"

  // 사용자 목록은 VIEWER 이상 공통 조회
  const usersResult = await getTenantUsers().then(
    (v) => ({ status: "fulfilled" as const, value: v }),
    (e) => ({ status: "rejected" as const, reason: e }),
  )

  // full-access 전용 데이터는 조건부 조회
  const [matrix, signupRequests, pendingCount, loginHistory, auditLogs] =
    fullAccess
      ? await Promise.allSettled([
          getPermissionMatrix(tenantId),
          getSignupRequests(),
          getPendingSignupCount(),
          getLoginHistory({ days: 7 }),
          getAuditLogs({ days: 30 }),
        ])
      : [
          { status: "fulfilled" as const, value: {} },
          { status: "fulfilled" as const, value: [] },
          { status: "fulfilled" as const, value: 0 },
          { status: "fulfilled" as const, value: [] },
          { status: "fulfilled" as const, value: [] },
        ]

  const matrixData = matrix.status === "fulfilled" ? matrix.value : {}
  const usersData = usersResult.status === "fulfilled" ? usersResult.value : []
  const signupData = signupRequests.status === "fulfilled" ? signupRequests.value : []
  const pending = pendingCount.status === "fulfilled" ? pendingCount.value : 0
  const loginHistoryData = loginHistory.status === "fulfilled" ? loginHistory.value : []
  const auditLogData = auditLogs.status === "fulfilled" ? auditLogs.value : []
  const usersError = usersResult.status === "rejected"
    ? usersResult.reason instanceof Error
      ? usersResult.reason.message
      : "사용자 목록을 불러오지 못했습니다."
    : null

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-[26px] font-bold leading-tight">사용자 / 권한 관리</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          사용자 계정, 가입 신청, 역할별 권한을 관리합니다
        </p>
      </div>

      <Tabs defaultValue={fullAccess ? "permissions" : "users"}>
        <TabsList className="h-9">
          {/* full-access 전용 탭 */}
          {fullAccess && (
            <TabsTrigger value="permissions" className="text-[13px]">
              권한 매트릭스
            </TabsTrigger>
          )}

          {/* 공통 탭 */}
          <TabsTrigger value="users" className="text-[13px]">
            사용자 목록
          </TabsTrigger>

          {/* full-access 전용 탭 */}
          {fullAccess && (
            <>
              <TabsTrigger value="signup-requests" className="text-[13px] flex items-center gap-1.5">
                가입 신청 관리
                {pending > 0 && (
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                    {pending > 9 ? "9+" : pending}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="login-history" className="text-[13px]">
                접속 기록
              </TabsTrigger>
              <TabsTrigger value="audit-log" className="text-[13px]">
                이용 로그
              </TabsTrigger>
            </>
          )}
        </TabsList>

        {/* 권한 매트릭스 (full-access 전용) */}
        {fullAccess && (
          <TabsContent value="permissions" className="mt-4">
            <PermissionMatrixTable matrix={matrixData} tenantId={tenantId} />
          </TabsContent>
        )}

        {/* 사용자 목록 (공통) */}
        <TabsContent value="users" className="mt-4">
          {usersError ? (
            <div className="flex items-center justify-center h-48 border rounded-xl text-[14px] text-muted-foreground">
              {usersError}
            </div>
          ) : (
            <UserManagementTable users={usersData} currentUserId={currentUser.id} />
          )}
        </TabsContent>

        {/* 가입 신청 관리 (full-access 전용) */}
        {fullAccess && (
          <TabsContent value="signup-requests" className="mt-4">
            <SignupRequestsTable requests={signupData} />
          </TabsContent>
        )}

        {/* 접속 기록 (full-access 전용) */}
        {fullAccess && (
          <TabsContent value="login-history" className="mt-4">
            <LoginHistoryTable initialRows={loginHistoryData} />
          </TabsContent>
        )}

        {/* 이용 로그 (full-access 전용) */}
        {fullAccess && (
          <TabsContent value="audit-log" className="mt-4">
            <AuditLogTable initialRows={auditLogData} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
