"use server"

import { prisma } from "@/lib/db/prisma"
import { requireRole, getTenantId } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { getErrorMessage } from "@/lib/utils"
import { createAttachmentSignedUrl, deleteAttachmentFile } from "@/lib/storage/attachment-storage"
import {
  serializeAttachmentRow,
  type AttachmentEntityType,
  type AttachmentRow,
} from "./attachment.helpers"

export type { AttachmentRow, AttachmentEntityType }

// ─── 청운커팅 사업계획서 "첨부파일관리" ──────────────────────────────────────
//
// 파일 업로드 자체(바이너리 바디)는 이 파일(Server Action)이 아니라
// src/app/api/upload/attachment/route.ts(Route Handler)가 담당한다 — 기존
// work-standard 업로드가 Server Action이 아니라 API route로 구현된 것과 동일한
// convention을 따른다(Server Action의 기본 body size 한도가 파일 업로드에는
// 작음). 이 파일은 조회(목록/다운로드 URL 발급)와 삭제만 다룬다.
//
// entityType/entityId는 client가 보낸 값을 신뢰하지 않고, 대상 레코드가 현재
// tenant 소속인지 서버에서 항상 재검증한다(assertAttachmentEntityOwnership —
// API route에서도 그대로 재사용).

const MENU_NAME = "첨부파일관리"

function revalidateAttachmentPaths() {
  revalidatePath("/app/mes/attachments")
  revalidatePath("/app/mes/quality/corrective-action")
  revalidatePath("/app/mes/quality/recurrence-prevention")
}

/**
 * entityType/entityId가 가리키는 실제 레코드가 현재 tenant 소속인지 서버에서
 * 재검증한다. API route(업로드)와 이 파일(조회/삭제 시 참조 무결성 확인)이
 * 공유한다 — 새 entityType을 추가하면 이 switch에도 분기를 추가해야 한다.
 */
export async function assertAttachmentEntityOwnership(
  entityType: AttachmentEntityType,
  entityId: string,
  tenantId: string
): Promise<void> {
  if (entityType === "DEFECT_CORRECTIVE_ACTION") {
    const row = await prisma.defectCorrectiveAction.findFirst({ where: { id: entityId, tenantId }, select: { id: true } })
    if (!row) throw new Error("연결 대상(조치관리)을 찾을 수 없습니다.")
    return
  }
  if (entityType === "DEFECT_RECURRENCE_PREVENTION") {
    const row = await prisma.defectRecurrencePrevention.findFirst({ where: { id: entityId, tenantId }, select: { id: true } })
    if (!row) throw new Error("연결 대상(재발방지관리)을 찾을 수 없습니다.")
    return
  }
  throw new Error("지원하지 않는 업무유형입니다.")
}

/**
 * entityId 직접 FK로 배치 조회해 "연결대상" 표시 문자열을 만든다(추측성 join 없음,
 * N+1 없이 entityType별로 최대 2개의 쿼리). tenant 조건을 포함해 cross-tenant
 * 레코드가 섞이지 않게 한다.
 */
async function buildEntityLabelMap(
  tenantId: string,
  rows: { entityType: string; entityId: string }[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const correctiveIds = Array.from(new Set(rows.filter((r) => r.entityType === "DEFECT_CORRECTIVE_ACTION").map((r) => r.entityId)))
  const preventionIds = Array.from(new Set(rows.filter((r) => r.entityType === "DEFECT_RECURRENCE_PREVENTION").map((r) => r.entityId)))

  const entitySelect = {
    id: true,
    defectRecord: {
      select: {
        qualityInspection: {
          select: {
            workOrderOperation: {
              select: { workOrder: { select: { orderNo: true, item: { select: { name: true } } } } },
            },
          },
        },
      },
    },
  } as const

  const [correctiveRecords, preventionRecords] = await Promise.all([
    correctiveIds.length
      ? prisma.defectCorrectiveAction.findMany({ where: { id: { in: correctiveIds }, tenantId }, select: entitySelect })
      : Promise.resolve([]),
    preventionIds.length
      ? prisma.defectRecurrencePrevention.findMany({ where: { id: { in: preventionIds }, tenantId }, select: entitySelect })
      : Promise.resolve([]),
  ])

  for (const r of [...correctiveRecords, ...preventionRecords]) {
    const wo = r.defectRecord.qualityInspection.workOrderOperation.workOrder
    map.set(r.id, `[${wo.orderNo}] ${wo.item.name}`)
  }
  return map
}

// ─── 목록 조회 ────────────────────────────────────────────────────────────────

export type AttachmentFilter = {
  entityType?: AttachmentEntityType
  entityId?: string
  extension?: string
  from?: string // YYYY-MM-DD — 첨부파일관리 전체 목록 화면에서만 사용(선택), 상세 Sheet의 entityId 조회에는 적용하지 않음
  to?: string
}

export async function getAttachments(filter: AttachmentFilter = {}): Promise<AttachmentRow[]> {
  await requireRole("VIEWER")
  const tenantId = await getTenantId()

  const records = await prisma.attachment.findMany({
    where: {
      tenantId,
      ...(filter.entityType && { entityType: filter.entityType }),
      ...(filter.entityId && { entityId: filter.entityId }),
      ...(filter.extension && { fileName: { endsWith: `.${filter.extension}`, mode: "insensitive" } }),
      ...(filter.from && { createdAt: { gte: new Date(`${filter.from}T00:00:00.000`) } }),
      ...(filter.to && { createdAt: { lte: new Date(`${filter.to}T23:59:59.999`) } }),
    },
    select: {
      id: true,
      entityType: true,
      entityId: true,
      fileName: true,
      mimeType: true,
      fileSize: true,
      description: true,
      uploadedById: true,
      uploadedBy: { select: { name: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  })

  const labelMap = await buildEntityLabelMap(tenantId, records)
  return records.map((r) => serializeAttachmentRow(r, labelMap))
}

// ─── 다운로드 ─────────────────────────────────────────────────────────────────

export async function getAttachmentDownloadUrl(id: string): Promise<{ url: string; fileName: string }> {
  await requireRole("VIEWER")
  const tenantId = await getTenantId()

  const attachment = await prisma.attachment.findFirst({ where: { id, tenantId } })
  if (!attachment) throw new Error("첨부파일을 찾을 수 없습니다.")

  const url = await createAttachmentSignedUrl(attachment.storagePath, 60)
  return { url, fileName: attachment.fileName }
}

// ─── 삭제 ───────────────────────────────────────────────────────────────────
//
// DB 삭제(+ AuditLog DELETE) → Storage 삭제 순서로 처리한다(§ STEP 22). DB가
// source of truth이므로, Storage 삭제가 실패해도 사용자에게는 성공으로 보고하고
// 서버 로그만 남긴다 — 반대로 Storage를 먼저 지우면 DB 삭제가 실패했을 때
// "존재하지 않는 파일을 가리키는" 더 나쁜 상태가 남는다.

export async function deleteAttachment(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireRole("OPERATOR")
    const tenantId = await getTenantId()

    const attachment = await prisma.attachment.findFirst({ where: { id, tenantId } })
    if (!attachment) throw new Error("첨부파일을 찾을 수 없습니다.")

    await prisma.$transaction(async (tx) => {
      const result = await tx.attachment.deleteMany({ where: { id, tenantId } })
      if (result.count === 0) throw new Error("첨부파일을 찾을 수 없습니다.")
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actor.id,
          actorLabel: actor.name,
          entityType: "Attachment",
          entityId: id,
          action: "DELETE",
          beforeData: {
            fileName: attachment.fileName,
            fileSize: attachment.fileSize,
            storagePath: attachment.storagePath,
            entityType: attachment.entityType,
            entityId: attachment.entityId,
          },
          menuName: MENU_NAME,
        },
      })
    })

    const storageResult = await deleteAttachmentFile(attachment.storagePath)
    if (!storageResult.ok) {
      console.error(`[attachment] storage cleanup failed after DB delete: ${attachment.storagePath} — ${storageResult.error}`)
    }

    revalidateAttachmentPaths()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: getErrorMessage(e) }
  }
}
