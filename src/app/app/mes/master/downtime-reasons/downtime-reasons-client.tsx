"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal, Pencil, PowerOff, Power, Plus, Search } from "lucide-react"
import { Badge }  from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input }  from "@/components/ui/input"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DataTable, DataTableColumnHeader } from "@/components/common/data-table"
import { useUserRole } from "@/lib/contexts/user-role-context"
import {
  toggleDowntimeReasonActive,
  type DowntimeReason,
} from "@/lib/actions/downtime-reason.actions"
import { DowntimeReasonFormSheet } from "./downtime-reason-form"

// ─── 에러 메시지 ──────────────────────────────────────────────────────────────

const TOGGLE_ERRORS: Record<string, string> = {
  NOT_FOUND:  "항목을 찾을 수 없습니다.",
  FORBIDDEN:  "권한이 없습니다.",
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  data: DowntimeReason[]
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export function DowntimeReasonsClient({ data }: Props) {
  const router    = useRouter()
  const canMutate = useUserRole() !== "VIEWER"

  const [keyword,    setKeyword]    = useState("")
  const [sheetOpen,  setSheetOpen]  = useState(false)
  const [editTarget, setEditTarget] = useState<DowntimeReason | null>(null)

  const filteredData = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return data
    return data.filter((r) => {
      const hay = [r.code, r.name, r.description ?? ""].join(" ").toLowerCase()
      return hay.includes(kw)
    })
  }, [data, keyword])

  const handleEdit = (r: DowntimeReason) => {
    setEditTarget(r)
    setSheetOpen(true)
  }

  const handleToggle = async (r: DowntimeReason) => {
    const action  = r.isActive ? "비활성" : "활성"
    const ok = window.confirm(`"${r.name}" 사유를 ${action} 처리하시겠습니까?`)
    if (!ok) return
    try {
      await toggleDowntimeReasonActive(r.id, !r.isActive)
      router.refresh()
    } catch (e: unknown) {
      const key = e instanceof Error ? e.message : ""
      alert(TOGGLE_ERRORS[key] ?? (e instanceof Error ? e.message : "처리 중 오류가 발생했습니다."))
    }
  }

  // ─── 컬럼 정의 ──────────────────────────────────────────────────────────────

  const columns = useMemo<ColumnDef<DowntimeReason>[]>(() => {
    const base: ColumnDef<DowntimeReason>[] = [
      {
        id:          "code",
        accessorKey: "code",
        header: ({ column }) => <DataTableColumnHeader column={column} title="코드" />,
        cell: ({ row }) => (
          <span className="font-mono text-[14px] font-medium">{row.original.code}</span>
        ),
      },
      {
        id:          "name",
        accessorKey: "name",
        header: ({ column }) => <DataTableColumnHeader column={column} title="사유명" />,
        cell: ({ row }) => <span className="text-[14px] font-medium">{row.original.name}</span>,
      },
      {
        id:          "description",
        accessorKey: "description",
        header:      "설명",
        cell: ({ row }) => (
          <span className="text-[13px] text-muted-foreground line-clamp-1 max-w-[240px]">
            {row.original.description ?? "—"}
          </span>
        ),
      },
      {
        id:          "displayOrder",
        accessorKey: "displayOrder",
        header: ({ column }) => <DataTableColumnHeader column={column} title="정렬순서" />,
        cell: ({ row }) => (
          <span className="text-[13px] tabular-nums text-muted-foreground">
            {row.original.displayOrder}
          </span>
        ),
      },
      {
        id:          "isActive",
        accessorKey: "isActive",
        header:      "사용여부",
        cell: ({ row }) => (
          row.original.isActive
            ? <Badge variant="default" className="bg-emerald-100 text-emerald-800 border-emerald-200">사용</Badge>
            : <Badge variant="secondary">미사용</Badge>
        ),
      },
      {
        id:     "updatedAt",
        header: "수정일",
        cell: ({ row }) => (
          <span className="text-[13px] text-muted-foreground">
            {new Date(row.original.updatedAt).toLocaleDateString("ko-KR")}
          </span>
        ),
      },
    ]

    if (!canMutate) return base

    return [
      ...base,
      {
        id:     "actions",
        header: "",
        cell: ({ row }) => {
          const r = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEdit(r)} className="text-[14px]">
                  <Pencil className="h-4 w-4 mr-2" />
                  수정
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleToggle(r)}
                  className="text-[14px]"
                >
                  {r.isActive
                    ? <><PowerOff className="h-4 w-4 mr-2 text-amber-600" /><span className="text-amber-700">비활성 처리</span></>
                    : <><Power    className="h-4 w-4 mr-2 text-emerald-600" /><span className="text-emerald-700">활성 처리</span></>
                  }
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
        enableSorting: false,
        enableHiding:  false,
      },
    ]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canMutate])

  // ─── 렌더 ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* 툴바 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="코드 / 사유명 / 설명 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="h-9 w-[260px] pl-9 text-[14px]"
          />
        </div>

        {canMutate && (
          <Button
            size="sm"
            onClick={() => { setEditTarget(null); setSheetOpen(true) }}
          >
            <Plus className="h-4 w-4 mr-2" />
            비가동사유 등록
          </Button>
        )}
      </div>

      <DataTable columns={columns} data={filteredData} />

      <DowntimeReasonFormSheet
        mode={editTarget ? "edit" : "create"}
        reason={editTarget}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open)
          if (!open) setEditTarget(null)
        }}
      />
    </div>
  )
}
