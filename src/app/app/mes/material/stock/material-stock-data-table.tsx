"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { DataTable } from "@/components/common/data-table"
import { getColumns } from "./columns"
import type { InventoryBalanceWithDetails } from "@/lib/actions/inventory.actions"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
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
  const [inStockOnly, setInStockOnly] = useState(true)

  const warehouseOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const balance of data) {
      if (selectedSiteId === "all" || balance.warehouse.siteId === selectedSiteId) {
        seen.set(balance.warehouseId, balance.warehouse.name)
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
  }, [data, selectedSiteId])

  const filteredData = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    return data.filter((balance) => {
      if (selectedSiteId !== "all" && balance.warehouse.siteId !== selectedSiteId) return false
      if (selectedWarehouseId !== "all" && balance.warehouseId !== selectedWarehouseId) return false
      if (inStockOnly && Number(balance.qtyOnHand) <= 0) return false
      if (normalizedKeyword.length > 0) {
        const haystack = [
          balance.item.code,
          balance.item.name,
          balance.item.spec ?? "",
          balance.warehouse.name,
          balance.lot?.lotNo ?? "",
        ]
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(normalizedKeyword)) return false
      }
      return true
    })
  }, [data, keyword, selectedSiteId, selectedWarehouseId, inStockOnly])

  const filterableColumns = [
    {
      id: "itemType" as keyof InventoryBalanceWithDetails,
      title: "품목유형",
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
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="품목명 / 규격 / LOT 번호 / 창고 검색"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            className="h-9 w-[320px] pl-9 text-[14px]"
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
          <span className="text-[14px] text-muted-foreground">창고</span>
          <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="전체" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {warehouseOptions.map((warehouse) => (
                <SelectItem key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label className="flex items-center gap-2 text-[14px] text-muted-foreground">
          <Checkbox
            checked={inStockOnly}
            onCheckedChange={(checked) => setInStockOnly(checked === true)}
          />
          재고 있음만 보기
        </label>
      </div>

      <DataTable
        columns={columns}
        data={filteredData}
        filterableColumns={filterableColumns}
      />
    </div>
  )
}
