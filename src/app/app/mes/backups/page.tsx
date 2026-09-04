import { getBackupManagementData } from "@/lib/actions/backup.actions"
import { BackupManagementClient } from "./backup-management-client"

export const dynamic = "force-dynamic"

export default async function BackupManagementPage() {
  const data = await getBackupManagementData()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
          백업관리
        </h1>
        <p className="text-[15px] text-muted-foreground mt-1">
          Supabase 자동 DB 백업 목록을 조회하고 그룹으로 분류합니다. 백업 자체의 생성·삭제·복원은 Supabase가 계속 전담합니다.
        </p>
      </div>

      <BackupManagementClient data={data} />
    </div>
  )
}
