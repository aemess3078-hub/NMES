"use server"

import { prisma } from "@/lib/db/prisma"
import { getTenantId, requireRole } from "@/lib/auth"
import { DocType } from "@prisma/client"
import { revalidatePath } from "next/cache"

const REVALIDATE_PATH = "/app/mes/quality/work-standards"

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocTypeValue = "SOP" | "DRAWING" | "SPEC" | "CERTIFICATE" | "OTHER"

export type WorkStandardRow = {
  id: string
  code: string
  name: string
  docType: DocTypeValue
  fileUrl: string | null
  linkCount: number
}

export type WorkStandardsSummary = {
  total: number
  sop: number
  withUrl: number
  withoutUrl: number
}

export type WorkStandardsData = {
  summary: WorkStandardsSummary
  rows: WorkStandardRow[]
}

// ─── 조회 ─────────────────────────────────────────────────────────────────────

export async function getWorkStandards(): Promise<WorkStandardsData> {
  const tenantId = await getTenantId()

  const documents = await prisma.document.findMany({
    where: { tenantId },
    include: {
      _count: { select: { documentLinks: true } },
    },
    orderBy: { code: "asc" },
  })

  const rows: WorkStandardRow[] = documents.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    docType: d.docType as DocTypeValue,
    fileUrl: d.fileUrl,
    linkCount: d._count.documentLinks,
  }))

  return {
    summary: {
      total: rows.length,
      sop: rows.filter((r) => r.docType === "SOP").length,
      withUrl: rows.filter((r) => !!r.fileUrl).length,
      withoutUrl: rows.filter((r) => !r.fileUrl).length,
    },
    rows,
  }
}

// ─── 등록 ─────────────────────────────────────────────────────────────────────

export async function createWorkStandard(data: {
  code: string
  name: string
  docType: string
  fileUrl?: string
}) {
  await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  if (!data.code.trim()) throw new Error("문서코드를 입력하세요.")
  if (!data.name.trim()) throw new Error("표준서명을 입력하세요.")

  const existing = await prisma.document.findUnique({
    where: { tenantId_code: { tenantId, code: data.code.trim() } },
  })
  if (existing) throw new Error(`문서코드 '${data.code}'가 이미 존재합니다.`)

  await prisma.document.create({
    data: {
      tenantId,
      code: data.code.trim(),
      name: data.name.trim(),
      docType: data.docType as DocType,
      fileUrl: data.fileUrl?.trim() || null,
    },
  })
  revalidatePath(REVALIDATE_PATH)
}

// ─── 수정 ─────────────────────────────────────────────────────────────────────

export async function updateWorkStandard(
  id: string,
  data: {
    name: string
    docType: string
    fileUrl?: string
  }
) {
  await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  if (!data.name.trim()) throw new Error("표준서명을 입력하세요.")

  const owned = await prisma.document.findFirst({ where: { id, tenantId } })
  if (!owned) throw new Error("문서를 찾을 수 없습니다.")

  await prisma.document.update({
    where: { id },
    data: {
      name: data.name.trim(),
      docType: data.docType as DocType,
      fileUrl: data.fileUrl?.trim() || null,
    },
  })
  revalidatePath(REVALIDATE_PATH)
}

// ─── 삭제 ─────────────────────────────────────────────────────────────────────
// DocumentLink 참조가 있으면 삭제 거부 (hard delete 전 안전 확인)

export async function deleteWorkStandard(id: string) {
  await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  const owned = await prisma.document.findFirst({
    where: { id, tenantId },
    include: { _count: { select: { documentLinks: true } } },
  })
  if (!owned) throw new Error("문서를 찾을 수 없습니다.")

  if (owned._count.documentLinks > 0) {
    throw new Error(
      `연결된 항목이 ${owned._count.documentLinks}건 있습니다. 연결 해제 후 삭제하세요.`
    )
  }

  await prisma.document.delete({ where: { id } })
  revalidatePath(REVALIDATE_PATH)
}
