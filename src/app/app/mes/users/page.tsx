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
import { requireRole } from "@/lib/auth"

export default async function UsersPage() {
  const currentUser = await requireRole("ADMIN")
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"

  const [matrix, users, signupRequests, pendingCount, loginHistory, auditLogs] =
    await Promise.allSettled([
      getPermissionMatrix(tenantId),
      getTenantUsers(),
      getSignupRequests(),
      getPendingSignupCount(),
      getLoginHistory({ days: 7 }),
      getAuditLogs({ days: 30 }),
    ])

  const matrixData = matrix.status === "fulfilled" ? matrix.value : {}
  const usersData = users.status === "fulfilled" ? users.value : []
  const signupData = signupRequests.status === "fulfilled" ? signupRequests.value : []
  const pending = pendingCount.status === "fulfilled" ? pendingCount.value : 0
  const loginHistoryData = loginHistory.status === "fulfilled" ? loginHistory.value : []
  const auditLogData = auditLogs.status === "fulfilled" ? auditLogs.value : []
  const usersError = users.status === "rejected"
    ? users.reason instanceof Error
      ? users.reason.message
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

      <Tabs defaultValue="permissions">
        <TabsList className="h-9">
          <TabsTrigger value="permissions" className="text-[13px]">
            권한 매트릭스
          </TabsTrigger>
          <TabsTrigger value="users" className="text-[13px]">
            사용자 목록
          </TabsTrigger>
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
        </TabsList>

        {/* 권한 매트릭스 (기존 동작 유지) */}
        <TabsContent value="permissions" className="mt-4">
          <PermissionMatrixTable matrix={matrixData} tenantId={tenantId} />
        </TabsContent>

        {/* 사용자 목록 */}
        <TabsContent value="users" className="mt-4">
          {usersError ? (
            <div className="flex items-center justify-center h-48 border rounded-xl text-[14px] text-muted-foreground">
              {usersError}
            </div>
          ) : (
            <UserManagementTable users={usersData} currentUserId={currentUser.id} />
          )}
        </TabsContent>

        {/* 가입 신청 관리 */}
        <TabsContent value="signup-requests" className="mt-4">
          <SignupRequestsTable requests={signupData} />
        </TabsContent>

        {/* 접속 기록 */}
        <TabsContent value="login-history" className="mt-4">
          <LoginHistoryTable initialRows={loginHistoryData} />
        </TabsContent>

        {/* 이용 로그 */}
        <TabsContent value="audit-log" className="mt-4">
          <AuditLogTable initialRows={auditLogData} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
