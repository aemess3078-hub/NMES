"use client"

import { useMemo, useState } from "react"
import { DataTable } from "@/components/common/data-table"
import { getColumns } from "./columns"
import { InventoryBalanceWithDetails } from "@/lib/actions/inventory.actions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Site {
  id: string
  code: string
  name: string
}

interface InventoryDataTableProps {
  data: InventoryBalanceWithDetails[]
  sites: Site[]
}

export function InventoryDataTable({ data, sites }: InventoryDataTableProps) {
  const columns = getColumns()
  const [selectedSiteId, setSelectedSiteId] = useState<string>("all")
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("all")

  const warehouseOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const b of data) {
      if (selectedSiteId === "all" || b.warehouse.siteId === selectedSiteId) {
        seen.set(b.warehouseId, b.warehouse.name)
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
  }, [data, selectedSiteId])

  const filteredData = useMemo(() => {
    return data.filter((b) => {
      if (selectedSiteId !== "all" && b.warehouse.siteId !== selectedSiteId) return false
      if (selectedWarehouseId !== "all" && b.warehouseId !== selectedWarehouseId) return false
      return true
    })
  }, [data, selectedSiteId, selectedWarehouseId])

  const filterableColumns = [
    {
      id: "itemType" as keyof InventoryBalanceWithDetails,
      title: "품목유형",
      options: [
        { label: "원자재", value: "RAW_MATERIAL" },
        { label: "반제품", value: "SEMI_FINISHED" },
        { label: "완제품", value: "FINISHED" },
        { label: "소모품", value: "CONSUMABLE" },
      ],
    },
  ]

  function handleSiteChange(value: string) {
    setSelectedSiteId(value)
    setSelectedWarehouseId("all")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[14px] text-muted-foreground">사이트</span>
          <Select value={selectedSiteId} onValueChange={handleSiteChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="전체" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {sites.map((site) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[14px] text-muted-foreground">로케이션</span>
          <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="전체" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {warehouseOptions.map((wh) => (
                <SelectItem key={wh.id} value={wh.id}>
                  {wh.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredData}
        searchableColumns={[
          { id: "itemCode" as keyof InventoryBalanceWithDetails, title: "품목코드" },
          { id: "itemName" as keyof InventoryBalanceWithDetails, title: "품목명" },
        ]}
        filterableColumns={filterableColumns}
      />
    </div>
  )
}
