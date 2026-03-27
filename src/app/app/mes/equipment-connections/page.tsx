import { cookies } from "next/headers"
import {
  getConnections,
  getEquipmentsForConnection,
  getGatewaysForConnection,
} from "@/lib/actions/equipment-integration.actions"
import { ConnectionDataTable } from "./connection-data-table"

export const dynamic = "force-dynamic"

export default async function EquipmentConnectionsPage() {
  const cookieStore = await cookies()
  const tenantId = cookieStore.get("tenantId")?.value ?? "tenant-demo-001"

  const [connections, equipments, gateways] = await Promise.all([
    getConnections(tenantId),
    getEquipmentsForConnection(tenantId),
    getGatewaysForConnection(tenantId),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
            설비 연결 설정
          </h1>
          <p className="text-[15px] text-muted-foreground mt-1">
            설비와 게이트웨이 간의 통신 프로토콜 및 연결 설정을 관리합니다.
          </p>
        </div>
      </div>

      <ConnectionDataTable
        data={connections}
        equipments={equipments}
        gateways={gateways}
      />
    </div>
  )
}
