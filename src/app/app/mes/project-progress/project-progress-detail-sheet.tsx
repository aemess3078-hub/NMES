"use client"

import { useEffect, useState, useCallback } from "react"
import { format } from "date-fns"
import { Plus, Workflow, Pencil, Trash2 } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal } from "lucide-react"
import { formatDDay } from "@/lib/date/kst"
import { computeStageSummary, resolveProjectDelayStatus, isStageDelayed } from "@/lib/project-stage-progress"
import {
  getProjectStageDetail,
  startProjectStage,
  completeProjectStage,
  deleteProjectStage,
  type ProjectStageDetailHeader,
  type ProjectStageRow,
} from "@/lib/actions/project-stage.actions"
import { PROJECT_STATUS_CONFIG, PRIORITY_CONFIG, DELAY_CONFIG } from "./columns"
import { StageFormDialog } from "./stage-form-dialog"
import { ImportRoutingDialog } from "./import-routing-dialog"

interface ProjectProgressDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectOrderId: string | null
}

const STAGE_STATUS_LABEL: Record<ProjectStageRow["status"], string> = {
  PENDING: "대기",
  IN_PROGRESS: "진행중",
  COMPLETED: "완료",
}

function fmtDate(d: Date | string | null): string {
  return d ? format(new Date(d), "yyyy-MM-dd") : "—"
}
function fmtDateTime(d: Date | string | null): string {
  return d ? format(new Date(d), "yyyy-MM-dd HH:mm") : "—"
}

export function ProjectProgressDetailSheet({
  open,
  onOpenChange,
  projectOrderId,
}: ProjectProgressDetailSheetProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [header, setHeader] = useState<ProjectStageDetailHeader | null>(null)
  const [stages, setStages] = useState<ProjectStageRow[]>([])

  const [stageDialogOpen, setStageDialogOpen] = useState(false)
  const [stageDialogMode, setStageDialogMode] = useState<"create" | "edit">("create")
  const [editingStage, setEditingStage] = useState<ProjectStageRow | null>(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)

  const refetch = useCallback(() => {
    if (!projectOrderId) return
    setIsLoading(true)
    getProjectStageDetail(projectOrderId)
      .then(({ projectOrder, stages }) => {
        setHeader(projectOrder)
        setStages(stages)
      })
      .catch((e) => alert(e instanceof Error ? e.message : "정보를 불러오지 못했습니다."))
      .finally(() => setIsLoading(false))
  }, [projectOrderId])

  useEffect(() => {
    if (open && projectOrderId) {
      refetch()
    } else if (!open) {
      setHeader(null)
      setStages([])
    }
  }, [open, projectOrderId, refetch])

  const handleStart = async (stageId: string) => {
    setPendingActionId(stageId)
    try {
      const result = await startProjectStage(stageId)
      if (!result.ok) {
        alert(result.error ?? "단계 시작 중 오류가 발생했습니다.")
        return
      }
      refetch()
    } finally {
      setPendingActionId(null)
    }
  }

  const handleComplete = async (stageId: string) => {
    setPendingActionId(stageId)
    try {
      const result = await completeProjectStage(stageId)
      if (!result.ok) {
        alert(result.error ?? "단계 완료 중 오류가 발생했습니다.")
        return
      }
      refetch()
    } finally {
      setPendingActionId(null)
    }
  }

  const handleDelete = async (stage: ProjectStageRow) => {
    if (!confirm(`'${stage.name}' 단계를 삭제하시겠습니까?`)) return
    setPendingActionId(stage.id)
    try {
      const result = await deleteProjectStage(stage.id)
      if (!result.ok) {
        alert(result.error ?? "삭제 중 오류가 발생했습니다.")
        return
      }
      refetch()
    } finally {
      setPendingActionId(null)
    }
  }

  if (!projectOrderId) return null

  const { completedCount, totalCount, percent } = computeStageSummary(stages)
  const delay = header ? resolveProjectDelayStatus(header.dueDate, header.status) : "NORMAL"
  const delayCfg = DELAY_CONFIG[delay]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        {isLoading && !header ? (
          <p className="text-[14px] text-muted-foreground py-8 text-center">불러오는 중...</p>
        ) : header ? (
          <>
            <SheetHeader className="pb-6 border-b">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <SheetTitle className="text-[20px] font-semibold font-mono">{header.code}</SheetTitle>
                  <p className="text-[15px] text-muted-foreground font-medium">{header.name}</p>
                  <p className="text-[13px] text-muted-foreground">{header.customer.name} · 담당 {header.owner.name}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 mt-1">
                  <div className="flex gap-1.5">
                    <Badge variant={PRIORITY_CONFIG[header.priority].variant} className="text-[12px]">
                      {PRIORITY_CONFIG[header.priority].label}
                    </Badge>
                    <Badge variant={PROJECT_STATUS_CONFIG[header.status].variant} className="text-[12px]">
                      {PROJECT_STATUS_CONFIG[header.status].label}
                    </Badge>
                  </div>
                  <Badge variant={delayCfg.variant} className="text-[12px]">{delayCfg.label}</Badge>
                </div>
              </div>

              <div className="flex gap-6 pt-2">
                <div className="space-y-0.5">
                  <p className="text-[12px] text-muted-foreground uppercase tracking-wide">시작예정</p>
                  <p className="text-[14px] font-medium">{fmtDate(header.plannedStartDate)}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[12px] text-muted-foreground uppercase tracking-wide">납기예정</p>
                  <p className="text-[14px] font-medium">
                    {fmtDate(header.dueDate)}
                    {header.dueDate && (
                      <span className="text-muted-foreground font-normal"> ({formatDDay(new Date(header.dueDate))})</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="pt-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-medium text-foreground">프로젝트 진행률</p>
                  <p className="text-[13px] text-muted-foreground tabular-nums">
                    {completedCount} / {totalCount} 단계 완료 · {percent}%
                  </p>
                </div>
                <Progress value={percent} />
              </div>
            </SheetHeader>

            <div className="pt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-semibold">단계 관리</h3>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setImportDialogOpen(true)}
                  >
                    <Workflow className="h-3.5 w-3.5 mr-1" />
                    공정 라우팅에서 가져오기
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setStageDialogMode("create")
                      setEditingStage(null)
                      setStageDialogOpen(true)
                    }}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    단계 추가
                  </Button>
                </div>
              </div>

              {stages.length === 0 ? (
                <div className="rounded-lg border border-dashed py-10 text-center">
                  <p className="text-[14px] text-muted-foreground">등록된 단계가 없습니다.</p>
                </div>
              ) : (
                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground w-12">순서</th>
                        <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">단계명</th>
                        <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">상태</th>
                        <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">계획시작</th>
                        <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">계획완료</th>
                        <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">실제시작</th>
                        <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">실제완료</th>
                        <th className="text-center px-3 py-2.5 font-medium text-muted-foreground w-24">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stages.map((stage) => {
                        const delayed = isStageDelayed(stage)
                        const busy = pendingActionId === stage.id
                        return (
                          <tr key={stage.id} className="border-b last:border-b-0 hover:bg-muted/20">
                            <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{stage.seq}</td>
                            <td className="px-3 py-2.5 font-medium">
                              {stage.name}
                              {delayed && (
                                <Badge variant="destructive" className="ml-2 text-[11px]">지연</Badge>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <Badge
                                variant={
                                  stage.status === "COMPLETED"
                                    ? "secondary"
                                    : stage.status === "IN_PROGRESS"
                                    ? "default"
                                    : "outline"
                                }
                                className="text-[12px]"
                              >
                                {STAGE_STATUS_LABEL[stage.status]}
                              </Badge>
                            </td>
                            <td className="px-3 py-2.5 text-center text-muted-foreground">{fmtDate(stage.plannedStartDate)}</td>
                            <td className="px-3 py-2.5 text-center text-muted-foreground">{fmtDate(stage.dueDate)}</td>
                            <td className="px-3 py-2.5 text-center text-muted-foreground">{fmtDateTime(stage.startedAt)}</td>
                            <td className="px-3 py-2.5 text-center text-muted-foreground">{fmtDateTime(stage.completedAt)}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center justify-center gap-1">
                                {stage.status === "PENDING" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[12px] px-2"
                                    disabled={busy}
                                    onClick={() => handleStart(stage.id)}
                                  >
                                    시작
                                  </Button>
                                )}
                                {stage.status === "IN_PROGRESS" && (
                                  <Button
                                    size="sm"
                                    className="h-7 text-[12px] px-2"
                                    disabled={busy}
                                    onClick={() => handleComplete(stage.id)}
                                  >
                                    완료
                                  </Button>
                                )}
                                {stage.status !== "COMPLETED" && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-7 w-7">
                                        <MoreHorizontal className="h-3.5 w-3.5" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setStageDialogMode("edit")
                                          setEditingStage(stage)
                                          setStageDialogOpen(true)
                                        }}
                                      >
                                        <Pencil className="mr-2 h-3.5 w-3.5" /> 수정
                                      </DropdownMenuItem>
                                      {stage.status === "PENDING" && (
                                        <DropdownMenuItem
                                          className="text-destructive focus:text-destructive"
                                          onClick={() => handleDelete(stage)}
                                        >
                                          <Trash2 className="mr-2 h-3.5 w-3.5" /> 삭제
                                        </DropdownMenuItem>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <StageFormDialog
              open={stageDialogOpen}
              onOpenChange={setStageDialogOpen}
              mode={stageDialogMode}
              projectOrderId={projectOrderId}
              stage={editingStage}
              onSuccess={refetch}
            />

            <ImportRoutingDialog
              open={importDialogOpen}
              onOpenChange={setImportDialogOpen}
              projectOrderId={projectOrderId}
              hasExistingStages={stages.length > 0}
              onSuccess={refetch}
            />
          </>
        ) : (
          <p className="text-[14px] text-muted-foreground py-8 text-center">프로젝트 오더를 찾을 수 없습니다.</p>
        )}
      </SheetContent>
    </Sheet>
  )
}
