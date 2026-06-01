"use client"

import { useState, useTransition } from "react"
import {
  BookOpen,
  FileText,
  Link2,
  FileX,
  ExternalLink,
  Pencil,
  Trash2,
  Plus,
  FileUp,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import { ColumnDef } from "@tanstack/react-table"
import {
  deleteWorkStandard,
  type WorkStandardsData,
  type WorkStandardRow,
} from "@/lib/actions/work-standards.actions"
import { WorkStandardsForm } from "./work-standards-form"

const DOC_TYPE_LABEL: Record<string, { label: string; className: string }> = {
  SOP: { label: "SOP", className: "bg-blue-100 text-blue-700 border-0" },
  DRAWING: { label: "DRAWING", className: "bg-violet-100 text-violet-700 border-0" },
  SPEC: { label: "SPEC", className: "bg-amber-100 text-amber-700 border-0" },
  CERTIFICATE: { label: "CERT", className: "bg-green-100 text-green-700 border-0" },
  OTHER: { label: "기타", className: "bg-slate-100 text-slate-600 border-0" },
}

interface Props {
  data: WorkStandardsData
}

export function WorkStandardsClient({ data }: Props) {
  const [formOpen, setFormOpen] = useState(false)
  const [editRow, setEditRow] = useState<WorkStandardRow | null>(null)
  const [isPending, startTransition] = useTransition()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function openCreate() {
    setEditRow(null)
    setFormOpen(true)
  }

  function openEdit(row: WorkStandardRow) {
    setEditRow(row)
    setFormOpen(true)
  }

  function handleDelete(row: WorkStandardRow) {
    if (!confirm(`"${row.name}" 표준서를 삭제하시겠습니까?`)) return
    setDeleteError(null)
    startTransition(async () => {
      try {
        await deleteWorkStandard(row.id)
      } catch (e: unknown) {
        setDeleteError(e instanceof Error ? e.message : "삭제 중 오류가 발생했습니다.")
      }
    })
  }

  const columns: ColumnDef<WorkStandardRow>[] = [
    {
      accessorKey: "code",
      header: "문서코드",
      cell: ({ row }) => (
        <span className="font-mono text-[13px] font-medium">{row.original.code}</span>
      ),
    },
    {
      accessorKey: "name",
      header: "표준서명",
      cell: ({ row }) => (
        <span className="text-[14px]">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "docType",
      header: "유형",
      cell: ({ row }) => {
        const cfg = DOC_TYPE_LABEL[row.original.docType] ?? DOC_TYPE_LABEL.OTHER
        return (
          <Badge className={`text-[12px] ${cfg.className}`}>{cfg.label}</Badge>
        )
      },
    },
    {
      accessorKey: "fileUrl",
      header: "파일",
      cell: ({ row }) => {
        const url = row.original.fileUrl
        if (!url) {
          return (
            <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
              <FileX className="h-3.5 w-3.5" />
              파일 없음
            </span>
          )
        }
        // Supabase Storage URL 또는 .pdf 확장자면 "PDF 보기", 그 외엔 "열기"
        const isPdf =
          url.toLowerCase().endsWith(".pdf") ||
          url.includes("/storage/v1/object/")
        return (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[13px] text-blue-600 hover:underline whitespace-nowrap"
          >
            {isPdf ? (
              <>
                <FileText className="h-3.5 w-3.5 text-red-500" />
                PDF 보기
              </>
            ) : (
              <>
                <ExternalLink className="h-3.5 w-3.5" />
                열기
              </>
            )}
          </a>
        )
      },
    },
    {
      accessorKey: "linkCount",
      header: "연결 수",
      cell: ({ row }) => (
        <span className="text-[14px] text-muted-foreground">{row.original.linkCount}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center gap-1 justify-end">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => openEdit(row.original)}
          >
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleDelete(row.original)}
            disabled={isPending}
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      ),
    },
  ]

  const { summary } = data

  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          icon={<BookOpen className="h-5 w-5 text-blue-600" />}
          iconBg="bg-blue-50"
          label="전체 표준서"
          value={summary.total}
        />
        <SummaryCard
          icon={<FileText className="h-5 w-5 text-violet-600" />}
          iconBg="bg-violet-50"
          label="SOP"
          value={summary.sop}
        />
        <SummaryCard
          icon={<FileUp className="h-5 w-5 text-green-600" />}
          iconBg="bg-green-50"
          label="파일 있음"
          value={summary.withUrl}
        />
        <SummaryCard
          icon={<FileX className="h-5 w-5 text-slate-500" />}
          iconBg="bg-slate-50"
          label="파일 없음"
          value={summary.withoutUrl}
        />
      </div>

      {deleteError && (
        <div className="text-[14px] text-red-500 bg-red-50 rounded-md px-4 py-2">
          {deleteError}
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <p className="text-[15px] font-medium">표준서 목록</p>
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />
            등록
          </Button>
        </div>
        <DataTable
          columns={columns}
          data={data.rows}
          filterableColumns={[
            {
              id: "docType",
              title: "유형",
              options: [
                { label: "SOP", value: "SOP" },
                { label: "DRAWING", value: "DRAWING" },
                { label: "SPEC", value: "SPEC" },
                { label: "CERTIFICATE", value: "CERTIFICATE" },
                { label: "OTHER", value: "OTHER" },
              ],
            },
          ]}
          searchableColumns={[
            { id: "code", title: "문서코드" },
            { id: "name", title: "표준서명" },
          ]}
        />
      </div>

      <WorkStandardsForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editRow={editRow}
      />
    </>
  )
}

function SummaryCard({
  icon,
  iconBg,
  label,
  value,
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: number
}) {
  return (
    <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
      <div className={`p-2 ${iconBg} rounded-lg`}>{icon}</div>
      <div>
        <p className="text-[13px] text-muted-foreground">{label}</p>
        <p className="text-[22px] font-semibold">{value}</p>
      </div>
    </div>
  )
}
