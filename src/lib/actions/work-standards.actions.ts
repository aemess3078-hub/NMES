"use server"

import { prisma } from "@/lib/db/prisma"
import { getTenantId, requireRole } from "@/lib/auth"
import { DocType, Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { requireResourcePermission } from "@/lib/auth/role-permissions"
import { recordAuditLog } from "@/lib/audit-log"
import { validateRoutingForItem } from "@/lib/actions/routing.actions"

const REVALIDATE_PATH = "/app/mes/quality/work-standards"
const MENU_NAME = "작업표준서관리"

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocTypeValue = "SOP" | "DRAWING" | "SPEC" | "CERTIFICATE" | "OTHER"

export type WorkStandardMappingRow = {
  id: string
  documentId: string
  itemId: string
  itemCode: string
  itemName: string
  routingOperationId: string
  operationCode: string
  operationName: string
  routingId: string
  routingCode: string
  routingName: string
  routingVersion: string
  isActive: boolean
  displayOrder: number
}

export type WorkStandardItemOption = {
  id: string
  code: string
  name: string
}

export type WorkStandardOperationOption = {
  id: string
  operationCode: string
  operationName: string
  seq: number
  routingId: string
  routingCode: string
  routingName: string
  routingVersion: string
  routingScope: string
}

export type WorkStandardRow = {
  id: string
  code: string
  name: string
  docType: DocTypeValue
  fileUrl: string | null
  linkCount: number
  mappingCount: number
  mappings: WorkStandardMappingRow[]
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
  items: WorkStandardItemOption[]
}

const mappingAuditInclude = {
  document: true,
  item: true,
  routingOperation: { include: { routing: true } },
} satisfies Prisma.WorkStandardMappingInclude

type MappingForAudit = Prisma.WorkStandardMappingGetPayload<{
  include: typeof mappingAuditInclude
}>

function toMappingRow(mapping: MappingForAudit): WorkStandardMappingRow {
  return {
    id: mapping.id,
    documentId: mapping.documentId,
    itemId: mapping.itemId,
    itemCode: mapping.item.code,
    itemName: mapping.item.name,
    routingOperationId: mapping.routingOperationId,
    operationCode: mapping.routingOperation.operationCode,
    operationName: mapping.routingOperation.name,
    routingId: mapping.routingOperation.routingId,
    routingCode: mapping.routingOperation.routing.code,
    routingName: mapping.routingOperation.routing.name,
    routingVersion: mapping.routingOperation.routing.version,
    isActive: mapping.isActive,
    displayOrder: mapping.displayOrder,
  }
}

function toMappingAuditData(mapping: MappingForAudit) {
  return {
    document: {
      id: mapping.documentId,
      code: mapping.document.code,
      name: mapping.document.name,
    },
    item: {
      id: mapping.itemId,
      code: mapping.item.code,
      name: mapping.item.name,
    },
    routingOperation: {
      id: mapping.routingOperationId,
      code: mapping.routingOperation.operationCode,
      name: mapping.routingOperation.name,
      routingId: mapping.routingOperation.routingId,
      routingCode: mapping.routingOperation.routing.code,
      routingName: mapping.routingOperation.routing.name,
      routingVersion: mapping.routingOperation.routing.version,
    },
    isActive: mapping.isActive,
    displayOrder: mapping.displayOrder,
  }
}

function normalizeDisplayOrder(value: unknown): number {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return 0
  return Math.trunc(n)
}

async function validateMappingTargets(params: {
  tenantId: string
  documentId: string
  itemId: string
  routingOperationId: string
}) {
  const [document, item, routingOperation] = await Promise.all([
    prisma.document.findFirst({
      where: { id: params.documentId, tenantId: params.tenantId },
      select: { id: true, docType: true, fileUrl: true },
    }),
    prisma.item.findFirst({
      where: { id: params.itemId, tenantId: params.tenantId },
      select: { id: true },
    }),
    prisma.routingOperation.findFirst({
      where: {
        id: params.routingOperationId,
        routing: { tenantId: params.tenantId },
      },
      select: {
        id: true,
        routingId: true,
      },
    }),
  ])

  if (!document) throw new Error("문서를 찾을 수 없습니다.")
  if (document.docType !== DocType.SOP) throw new Error("SOP 문서만 POP 작업표준서로 매핑할 수 있습니다.")
  if (!document.fileUrl?.trim()) throw new Error("파일 URL이 있는 SOP만 POP에 표시할 수 있습니다.")
  if (!item) throw new Error("품목을 찾을 수 없습니다.")
  if (!routingOperation) throw new Error("라우팅 공정을 찾을 수 없습니다.")

  await validateRoutingForItem({
    tenantId: params.tenantId,
    itemId: params.itemId,
    routingId: routingOperation.routingId,
  })
}

// ─── 조회 ─────────────────────────────────────────────────────────────────────

export async function getWorkStandards(): Promise<WorkStandardsData> {
  await requireResourcePermission("WORK_STANDARD", "READ")
  const tenantId = await getTenantId()

  const [documents, items] = await Promise.all([
    prisma.document.findMany({
      where: { tenantId },
      include: {
        _count: { select: { documentLinks: true, workStandardMappings: true } },
        workStandardMappings: {
          include: mappingAuditInclude,
          orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: { code: "asc" },
    }),
    prisma.item.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ])

  const rows: WorkStandardRow[] = documents.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    docType: d.docType as DocTypeValue,
    fileUrl: d.fileUrl,
    linkCount: d._count.documentLinks,
    mappingCount: d._count.workStandardMappings,
    mappings: d.workStandardMappings.map(toMappingRow),
  }))

  return {
    summary: {
      total: rows.length,
      sop: rows.filter((r) => r.docType === "SOP").length,
      withUrl: rows.filter((r) => !!r.fileUrl).length,
      withoutUrl: rows.filter((r) => !r.fileUrl).length,
    },
    rows,
    items,
  }
}

export async function getWorkStandardRoutingOperationOptions(
  itemId: string
): Promise<WorkStandardOperationOption[]> {
  await requireResourcePermission("WORK_STANDARD", "READ")
  const tenantId = await getTenantId()

  const item = await prisma.item.findFirst({
    where: { id: itemId, tenantId },
    select: { id: true },
  })
  if (!item) throw new Error("품목을 찾을 수 없습니다.")

  const routings = await prisma.routing.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      OR: [
        { scope: "COMMON" },
        { scope: "ITEM_SPECIFIC", items: { some: { itemId } } },
      ],
    },
    include: {
      operations: { orderBy: { seq: "asc" } },
    },
    orderBy: [{ code: "asc" }, { version: "asc" }],
  })

  return routings.flatMap((routing) =>
    routing.operations.map((operation) => ({
      id: operation.id,
      operationCode: operation.operationCode,
      operationName: operation.name,
      seq: operation.seq,
      routingId: routing.id,
      routingCode: routing.code,
      routingName: routing.name,
      routingVersion: routing.version,
      routingScope: routing.scope,
    }))
  )
}

// ─── 등록 ─────────────────────────────────────────────────────────────────────

export async function createWorkStandard(data: {
  code: string
  name: string
  docType: string
  fileUrl?: string
}) {
  await requireResourcePermission("WORK_STANDARD", "CREATE")
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

export async function createWorkStandardMapping(data: {
  documentId: string
  itemId: string
  routingOperationId: string
  displayOrder?: number
}) {
  await requireResourcePermission("WORK_STANDARD", "UPDATE")
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  await validateMappingTargets({
    tenantId,
    documentId: data.documentId,
    itemId: data.itemId,
    routingOperationId: data.routingOperationId,
  })

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.workStandardMapping.create({
        data: {
          tenantId,
          documentId: data.documentId,
          itemId: data.itemId,
          routingOperationId: data.routingOperationId,
          displayOrder: normalizeDisplayOrder(data.displayOrder),
        },
        include: mappingAuditInclude,
      })

      await recordAuditLog(tx, {
        tenantId,
        actor,
        entityType: "WorkStandardMapping",
        entityId: created.id,
        action: "CREATE",
        afterData: toMappingAuditData(created),
        menuName: MENU_NAME,
      })
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("이미 같은 SOP/품목/공정 매핑이 존재합니다.")
    }
    throw e
  }

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
  await requireResourcePermission("WORK_STANDARD", "UPDATE")
  await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  if (!data.name.trim()) throw new Error("표준서명을 입력하세요.")

  const owned = await prisma.document.findFirst({
    where: { id, tenantId },
    include: { _count: { select: { workStandardMappings: true } } },
  })
  if (!owned) throw new Error("문서를 찾을 수 없습니다.")

  const nextDocType = data.docType as DocType
  if (owned._count.workStandardMappings > 0 && nextDocType !== DocType.SOP) {
    throw new Error("POP 작업표준서 매핑이 있는 문서는 SOP 외 유형으로 변경할 수 없습니다.")
  }

  await prisma.document.update({
    where: { id },
    data: {
      name: data.name.trim(),
      docType: nextDocType,
      fileUrl: data.fileUrl?.trim() || null,
    },
  })
  revalidatePath(REVALIDATE_PATH)
}

export async function updateWorkStandardMapping(
  id: string,
  data: {
    isActive: boolean
    displayOrder?: number
  }
) {
  await requireResourcePermission("WORK_STANDARD", "UPDATE")
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  await prisma.$transaction(async (tx) => {
    const before = await tx.workStandardMapping.findFirst({
      where: { id, tenantId },
      include: mappingAuditInclude,
    })
    if (!before) throw new Error("작업표준서 매핑을 찾을 수 없습니다.")

    const updated = await tx.workStandardMapping.update({
      where: { id },
      data: {
        isActive: Boolean(data.isActive),
        displayOrder: normalizeDisplayOrder(data.displayOrder),
      },
      include: mappingAuditInclude,
    })

    await recordAuditLog(tx, {
      tenantId,
      actor,
      entityType: "WorkStandardMapping",
      entityId: updated.id,
      action: "UPDATE",
      beforeData: toMappingAuditData(before),
      afterData: toMappingAuditData(updated),
      menuName: MENU_NAME,
    })
  })

  revalidatePath(REVALIDATE_PATH)
}

// ─── 삭제 ─────────────────────────────────────────────────────────────────────
// DocumentLink 또는 POP 작업표준서 매핑 참조가 있으면 삭제 거부 (hard delete 전 안전 확인)

export async function deleteWorkStandard(id: string) {
  await requireResourcePermission("WORK_STANDARD", "DELETE")
  await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  const owned = await prisma.document.findFirst({
    where: { id, tenantId },
    include: { _count: { select: { documentLinks: true, workStandardMappings: true } } },
  })
  if (!owned) throw new Error("문서를 찾을 수 없습니다.")

  if (owned._count.documentLinks > 0) {
    throw new Error(
      `연결된 항목이 ${owned._count.documentLinks}건 있습니다. 연결 해제 후 삭제하세요.`
    )
  }
  if (owned._count.workStandardMappings > 0) {
    throw new Error(
      `POP 작업표준서 매핑이 ${owned._count.workStandardMappings}건 있습니다. 매핑 해제 후 삭제하세요.`
    )
  }

  await prisma.document.delete({ where: { id } })
  revalidatePath(REVALIDATE_PATH)
}

export async function deleteWorkStandardMapping(id: string) {
  await requireResourcePermission("WORK_STANDARD", "UPDATE")
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  await prisma.$transaction(async (tx) => {
    const before = await tx.workStandardMapping.findFirst({
      where: { id, tenantId },
      include: mappingAuditInclude,
    })
    if (!before) throw new Error("작업표준서 매핑을 찾을 수 없습니다.")

    await tx.workStandardMapping.delete({ where: { id } })

    await recordAuditLog(tx, {
      tenantId,
      actor,
      entityType: "WorkStandardMapping",
      entityId: before.id,
      action: "DELETE",
      beforeData: toMappingAuditData(before),
      menuName: MENU_NAME,
    })
  })

  revalidatePath(REVALIDATE_PATH)
}
