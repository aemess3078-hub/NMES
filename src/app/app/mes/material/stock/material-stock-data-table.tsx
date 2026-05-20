"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { DataTable } from "@/components/common/data-table"
import { getColumns } from "./columns"
import type { InventoryBalanceWithDetails } from "@/lib/actions/inventory.actions"
import { Input } from "@/components/ui/input"
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

interface MaterialStockDataTableProps {
  data: InventoryBalanceWithDetails[]
  sites: Site[]
}

export function MaterialStockDataTable({ data, sites }: MaterialStockDataTableProps) {
  const columns = getColumns()
  const [keyword, setKeyword] = useState("")
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
    const kw = keyword.trim().toLowerCase()
    return data.filter((b) => {
      if (selectedSiteId !== "all" && b.warehouse.siteId !== selectedSiteId) return false
      if (selectedWarehouseId !== "all" && b.warehouseId !== selectedWarehouseId) return false
      if (kw.length > 0) {
        const hay = [
          b.item.code,
          b.item.name,
          b.warehouse.name,
          b.lot?.lotNo ?? "",
        ]
          .join(" ")
          .toLowerCase()
        if (!hay.includes(kw)) return false
      }
      return true
    })
  }, [data, keyword, selectedSiteId, selectedWarehouseId])

  const filterableColumns = [
    {
      id: "itemType" as keyof InventoryBalanceWithDetails,
      title: "자재유형",
      options: [
        { label: "원자재", value: "RAW_MATERIAL" },
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
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="자재코드 / 자재명 / 창고 / LOT 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="h-9 w-[280px] pl-9 text-[14px]"
          />
        </div>

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
        filterableColumns={filterableColumns}
      />
    </div>
  )
}
