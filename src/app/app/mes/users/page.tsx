export const dynamic = "force-dynamic"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getPermissionMatrix } from "@/lib/actions/permission.actions"
import { getTenantUsers } from "@/lib/actions/user-management.actions"
import { getSignupRequests, getPendingSignupCount } from "@/lib/actions/signup-request.actions"
import { PermissionMatrixTable } from "./permission-matrix"
import { UserManagementTable } from "./user-management-table"
import { SignupRequestsTable } from "./signup-requests-table"
import { cookies } from "next/headers"
import { getCurrentUser } from "@/lib/auth"

export default async function UsersPage() {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"

  const [currentUser, matrix, users, signupRequests, pendingCount] = await Promise.allSettled([
    getCurrentUser(),
    getPermissionMatrix(tenantId),
    getTenantUsers(),
    getSignupRequests(),
    getPendingSignupCount(),
  ])

  const me = currentUser.status === "fulfilled" ? currentUser.value : null
  const matrixData = matrix.status === "fulfilled" ? matrix.value : {}
  const usersData = users.status === "fulfilled" ? users.value : []
  const signupData = signupRequests.status === "fulfilled" ? signupRequests.value : []
  const pending = pendingCount.status === "fulfilled" ? pendingCount.value : 0

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
        </TabsList>

        {/* 권한 매트릭스 (기존 동작 유지) */}
        <TabsContent value="permissions" className="mt-4">
          <PermissionMatrixTable matrix={matrixData} tenantId={tenantId} />
        </TabsContent>

        {/* 사용자 목록 */}
        <TabsContent value="users" className="mt-4">
          {usersData.length === 0 && users.status === "rejected" ? (
            <div className="flex items-center justify-center h-48 border rounded-xl text-[14px] text-muted-foreground">
              사용자 목록을 불러오려면 관리자(ADMIN) 이상 권한이 필요합니다.
            </div>
          ) : (
            <UserManagementTable users={usersData} currentUserId={me?.id ?? ""} />
          )}
        </TabsContent>

        {/* 가입 신청 관리 */}
        <TabsContent value="signup-requests" className="mt-4">
          {signupData.length === 0 && signupRequests.status === "rejected" ? (
            <div className="flex items-center justify-center h-48 border rounded-xl text-[14px] text-muted-foreground">
              가입 신청 목록을 보려면 관리자(ADMIN) 이상 권한이 필요합니다.
            </div>
          ) : (
            <SignupRequestsTable requests={signupData} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
