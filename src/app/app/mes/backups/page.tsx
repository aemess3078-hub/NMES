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
      </div>

      <BackupManagementClient data={data} />
    </div>
  )
}
