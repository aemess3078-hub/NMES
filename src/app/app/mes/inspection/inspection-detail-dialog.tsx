"use client"

import { format } from "date-fns"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { QualityInspectionWithDetails } from "@/lib/actions/quality.actions"
import { RESULT_CONFIG } from "./inspection-columns"

// ─── 불량 중요도 / 처리방법 레이블 ───────────────────────────────────────────

const SEVERITY_LABELS: Record<string, string> = {
  CRITICAL: "치명",
  MAJOR:    "주요",
  MINOR:    "경미",
}

const SEVERITY_CLASSES: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800",
  MAJOR:    "bg-amber-100 text-amber-800",
  MINOR:    "bg-blue-100 text-blue-800",
}

const DISPOSITION_LABELS: Record<string, string> = {
  SCRAP:     "폐기",
  REWORK:    "재작업",
  ACCEPT:    "허용",
  USE_AS_IS: "현상유지",
}

// ─── Component ────────────────────────────────────────────────────────────────

interface InspectionDetailDialogProps {
  inspection: QualityInspectionWithDetails | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InspectionDetailDialog({
  inspection,
  open,
  onOpenChange,
}: InspectionDetailDialogProps) {
  if (!inspection) return null

  const wo = inspection.workOrderOperation.workOrder
  const op = inspection.workOrderOperation.routingOperation
  const resultCfg = inspection.result ? RESULT_CONFIG[inspection.result] : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[18px]">검사 상세 정보</DialogTitle>
        </DialogHeader>

        {/* 기본 정보 그리드 */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 py-2">
          <InfoRow label="작업지시" value={wo.orderNo} mono />
          <InfoRow label="품목" value={`[${wo.item.code}] ${wo.item.name}`} />
          <InfoRow label="공정" value={`${op.name} (seq.${op.seq})`} />
          <InfoRow
            label="검사기준"
            value={`${inspection.inspectionSpec.item.name} v${inspection.inspectionSpec.version}`}
          />
          <InfoRow label="검사자" value={inspection.inspector.name} />
          <InfoRow
            label="검사일시"
            value={format(new Date(inspection.inspectedAt), "yyyy-MM-dd HH:mm")}
            mono
          />
          <InfoRow
            label="검사수량"
            value={Number(inspection.inspectedQty).toLocaleString()}
            mono
          />
          <div className="space-y-1">
            <p className="text-[12px] text-muted-foreground">판정</p>
            {resultCfg ? (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-medium ${resultCfg.className}`}
              >
                {resultCfg.label}
              </span>
            ) : (
              <span className="text-[13px] text-muted-foreground">미판정</span>
            )}
          </div>
        </div>

        {/* 불량 기록 */}
        <div className="border-t pt-4 space-y-3">
          <p className="text-[15px] font-medium">
            불량 기록
            {inspection.defectRecords.length > 0 && (
              <span className="ml-2 text-[13px] font-normal text-muted-foreground">
                ({inspection.defectRecords.length}건)
              </span>
            )}
          </p>

          {inspection.defectRecords.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-2">불량 기록이 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[13px]">불량코드</TableHead>
                  <TableHead className="text-[13px]">불량명</TableHead>
                  <TableHead className="text-[13px] w-16 text-right">수량</TableHead>
                  <TableHead className="text-[13px] w-20">중요도</TableHead>
                  <TableHead className="text-[13px] w-24">처리방법</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspection.defectRecords.map((dr) => (
                  <TableRow key={dr.id}>
                    <TableCell className="font-mono text-[13px]">
                      {dr.defectCode.code}
                    </TableCell>
                    <TableCell className="text-[13px]">{dr.defectCode.name}</TableCell>
                    <TableCell className="text-right font-mono text-[13px]">
                      {Number(dr.qty).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${
                          SEVERITY_CLASSES[dr.severity] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {SEVERITY_LABELS[dr.severity] ?? dr.severity}
                      </span>
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">
                      {dr.disposition
                        ? (DISPOSITION_LABELS[dr.disposition] ?? dr.disposition)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── 헬퍼 컴포넌트 ────────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className={`text-[13px] font-medium ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  )
}
