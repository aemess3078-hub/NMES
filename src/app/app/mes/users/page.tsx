export const dynamic = "force-dynamic"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getPermissionMatrix } from "@/lib/actions/permission.actions"
import { getTenantUsers } from "@/lib/actions/user-management.actions"
import { getSignupRequests, getPendingSignupCount } from "@/lib/actions/signup-request.actions"
import { getCurrentUser } from "@/lib/auth"
import { PermissionMatrixTable } from "./permission-matrix"
import { UserManagementTable } from "./user-management-table"
import { SignupRequestsTable } from "./signup-requests-table"
import { isFeatureEnabled } from "@/lib/services/feature.service"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export default async function UsersPage() {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"

  const enabled = await isFeatureEnabled(tenantId, "PERMISSION")
  if (!enabled) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">이 기능은 활성화되어 있지 않습니다.</p>
      </div>
    )
  }

  // 현재 사용자 권한 확인 (ADMIN 미만이면 redirect)
  const currentUser = await getCurrentUser()
  if (!currentUser || !["OWNER", "ADMIN"].includes(currentUser.role)) {
    redirect("/app/mes")
  }

  const [matrix, users, signupRequests, pendingCount] = await Promise.all([
    getPermissionMatrix(tenantId),
    getTenantUsers(),
    getSignupRequests(),
    getPendingSignupCount(),
  ])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-[26px] font-bold leading-tight">사용자 / 권한 관리</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          사용자 계정, 가입 신청, 역할별 권한을 관리합니다
        </p>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="h-9">
          <TabsTrigger value="users" className="text-[13px]">
            사용자 목록
          </TabsTrigger>
          <TabsTrigger value="signup-requests" className="text-[13px] flex items-center gap-1.5">
            가입 신청 관리
            {pendingCount > 0 && (
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="permissions" className="text-[13px]">
            권한 매트릭스
          </TabsTrigger>
        </TabsList>

        {/* 사용자 목록 */}
        <TabsContent value="users" className="mt-4">
          <UserManagementTable
            users={users}
            currentUserId={currentUser.id}
          />
        </TabsContent>

        {/* 가입 신청 관리 */}
        <TabsContent value="signup-requests" className="mt-4">
          <SignupRequestsTable requests={signupRequests} />
        </TabsContent>

        {/* 권한 매트릭스 */}
        <TabsContent value="permissions" className="mt-4">
          <PermissionMatrixTable matrix={matrix} tenantId={tenantId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
