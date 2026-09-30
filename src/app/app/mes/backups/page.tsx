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
          전산 백업 현황을 확인하고, 필요한 항목을 작업 기준에 맞게 분류하거나 목록에서 숨길 수 있습니다.
        </p>
      </div>

      <BackupManagementClient data={data} />
    </div>
  )
}
