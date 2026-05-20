"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"

import { DataTable } from "@/components/common/data-table"
import { Input } from "@/components/ui/input"
import type { WipInventoryRow } from "@/lib/actions/work-order.actions"
import { getColumns } from "./columns"

interface WipInventoryDataTableProps {
  data: WipInventoryRow[]
}

export function WipInventoryDataTable({ data }: WipInventoryDataTableProps) {
  const columns = getColumns()
  const [keyword, setKeyword] = useState("")
  const [startDateFrom, setStartDateFrom] = useState("")
  const [startDateTo, setStartDateTo] = useState("")

  const filteredData = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    const fromTime = startDateFrom ? new Date(`${startDateFrom}T00:00:00`).getTime() : null
    const toTime = startDateTo ? new Date(`${startDateTo}T23:59:59`).getTime() : null

    return data.filter((row) => {
      const baseDate = new Date(row.startedAt ?? row.workOrder.createdAt).getTime()
      if (fromTime !== null && baseDate < fromTime) return false
      if (toTime !== null && baseDate > toTime) return false

      if (kw.length > 0) {
        const haystack = [
          row.workOrder.orderNo,
          row.workOrder.item.code,
          row.workOrder.item.name,
          row.routingOperation.operationCode,
          row.routingOperation.name,
          row.routingOperation.workCenter.name,
          row.equipment?.code ?? "",
          row.equipment?.name ?? "",
          ...row.wipLocations.flatMap((location) => [location.code, location.name]),
        ]
          .join(" ")
          .toLowerCase()

        if (!haystack.includes(kw)) return false
      }

      return true
    })
  }, [data, keyword, startDateFrom, startDateTo])

  const filterableColumns = [
    {
      id: "status" as keyof WipInventoryRow,
      title: "상태",
      options: [
        { label: "대기", value: "PENDING" },
        { label: "진행중", value: "IN_PROGRESS" },
        { label: "완료", value: "COMPLETED" },
        { label: "건너뜀", value: "SKIPPED" },
      ],
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="작업지시 / 품목 / 공정 / 작업장 검색"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            className="h-9 w-[340px] pl-9 text-[14px]"
          />
        </div>

        <label className="space-y-1">
          <span className="block text-[13px] text-muted-foreground">시작일 시작</span>
          <Input
            type="date"
            value={startDateFrom}
            onChange={(event) => setStartDateFrom(event.target.value)}
            className="h-9 w-[150px] text-[14px]"
          />
        </label>

        <label className="space-y-1">
          <span className="block text-[13px] text-muted-foreground">시작일 종료</span>
          <Input
            type="date"
            value={startDateTo}
            onChange={(event) => setStartDateTo(event.target.value)}
            className="h-9 w-[150px] text-[14px]"
          />
        </label>
      </div>

      <DataTable
        columns={columns}
        data={filteredData}
        filterableColumns={filterableColumns}
        pageSize={20}
      />
    </div>
  )
}
