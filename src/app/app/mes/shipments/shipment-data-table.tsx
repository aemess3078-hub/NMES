"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import { getColumns, ShipmentRow } from "./columns"
import { ShipmentFormSheet } from "./shipment-form-sheet"
import { confirmShipment, deleteShipment } from "@/lib/actions/shipment.actions"

type SalesOrderOption = {
  id: string
  orderNo: string
  customer: { name: string }
  items: {
    id: string
    itemId: string
    qty: number | string
    shippedQty: number | string
    item: { id: string; code: string; name: string }
  }[]
}

type WarehouseOption = { id: string; code: string; name: string }

interface ShipmentDataTableProps {
  data: ShipmentRow[]
  tenantId: string
  siteId: string
  salesOrders: SalesOrderOption[]
  warehouses: WarehouseOption[]
}

export function ShipmentDataTable({
  data,
  tenantId,
  siteId,
  salesOrders,
  warehouses,
}: ShipmentDataTableProps) {
  const router = useRouter()
  const [formOpen, setFormOpen] = useState(false)

  const handleConfirm = async (id: string) => {
    const shipment = data.find((d) => d.id === id)
    if (!shipment) return

    if (!confirm(`'${shipment.shipmentNo}' 출하를 확정하시겠습니까?`)) return

    try {
      await confirmShipment(id)
      router.refresh()
    } catch (error) {
      console.error("확정 실패:", error)
      alert(error instanceof Error ? error.message : "확정 중 오류가 발생했습니다.")
    }
  }

  const handleDelete = async (id: string) => {
    const shipment = data.find((d) => d.id === id)
    if (!shipment) return

    if (shipment.status !== "PLANNED") {
      alert("PLANNED 상태인 출하만 삭제할 수 있습니다.")
      return
    }

    if (!confirm(`'${shipment.shipmentNo}' 출하를 삭제하시겠습니까?`)) return

    try {
      await deleteShipment(id)
      router.refresh()
    } catch (error) {
      console.error("삭제 실패:", error)
      alert(error instanceof Error ? error.message : "삭제 중 오류가 발생했습니다.")
    }
  }

  const columns = getColumns(handleConfirm, handleDelete)

  const filterableColumns = [
    {
      id: "status" as keyof ShipmentRow,
      title: "상태",
      options: [
        { label: "출하예정", value: "PLANNED" },
        { label: "피킹완료", value: "PICKED" },
        { label: "출하완료", value: "SHIPPED" },
        { label: "배송완료", value: "DELIVERED" },
        { label: "취소", value: "CANCELLED" },
      ],
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          출하 등록
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchableColumns={[
          { id: "shipmentNo" as keyof ShipmentRow, title: "출하번호" },
        ]}
        filterableColumns={filterableColumns}
      />

      <ShipmentFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        tenantId={tenantId}
        siteId={siteId}
        salesOrders={salesOrders}
        warehouses={warehouses}
      />
    </div>
  )
}
