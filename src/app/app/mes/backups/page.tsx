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
        <p className="mt-1 text-[14px] text-muted-foreground">
          Supabase 데이터베이스 백업 상태를 조회하고 NMES 내부에서 분류·숨김 관리합니다.
        </p>
      </div>

      <BackupManagementClient data={data} />
    </div>
  )
}
