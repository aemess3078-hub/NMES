"use server"

import { prisma } from "@/lib/db/prisma"
import {
  InspectionSpecStatus,
  InspectionInputType,
  InspectionResult,
  InspectionStage,
  DefectCategory,
  DefectSeverity,
  DefectDisposition,
} from "@prisma/client"
import { revalidatePath } from "next/cache"
import { requireRole, getTenantId } from "@/lib/auth"
import { checkDefectCodeReferencesForBulk, requireBulkDeletePermission } from "./reference-check.server"

export type DefectCodeRow = {
  id: string
  tenantId: string
  code: string
  name: string
  defectCategory: DefectCategory
}

export type InspectionSpecWithItems = {
  id: string
  tenantId: string
  itemId: string
  routingOperationId: string
  version: string
  status: InspectionSpecStatus
  createdAt: string
  updatedAt: string
  item: { id: string; code: string; name: string }
  routingOperation: { id: string; name: string; seq: number; routingId: string }
  inspectionItems: InspectionItemRow[]
}

export type InspectionItemRow = {
  id: string
  inspectionSpecId: string
  seq: number
  name: string
  inputType: InspectionInputType
  lowerLimit: number | null
  upperLimit: number | null
}

export type QualityInspectionWithDetails = {
  id: string
  workOrderOperationId: string
  inspectionSpecId: string
  inspectorId: string
  stage: InspectionStage
  result: InspectionResult | null
  inspectedQty: number
  inspectedAt: string
  workOrderOperation: {
    id: string
    seq: number
    workOrderId: string
    routingOperationId: string
    workOrder: {
      id: string
      orderNo: string
      manufacturingNo: string | null
      item: { code: string; name: string }
    }
    routingOperation: { id: string; name: string; seq: number }
  }
  inspectionSpec: { id: string; version: string; item: { name: string } }
  inspector: { id: string; name: string }
  defectRecords: DefectRecordRow[]
}

export type DefectRecordRow = {
  id: string
  qualityInspectionId: string
  defectCodeId: string
  qty: number
  severity: DefectSeverity
  disposition: DefectDisposition | null
  defectCode: { id: string; code: string; name: string; defectCategory: DefectCategory }
}

export type CreateDefectCodeInput = {
  code: string
  name: string
  defectCategory: DefectCategory
}

export type UpdateDefectCodeInput = {
  name?: string
  defectCategory?: DefectCategory
}

export type CreateInspectionSpecInput = {
  itemId: string
  routingOperationId: string
  version: string
  status: InspectionSpecStatus
}

export type UpdateInspectionSpecInput = {
  version?: string
  status?: InspectionSpecStatus
}

export type UpsertInspectionItemInput = {
  seq: number
  name: string
  inputType: InspectionInputType
  lowerLimit?: number | null
  upperLimit?: number | null
}

export type CreateQualityInspectionInput = {
  workOrderOperationId: string
  inspectionSpecId: string
  inspectorId: string
  result: InspectionResult | null
  inspectedQty: number
  inspectedAt: string
  defectRecords: {
    defectCodeId: string
    qty: number
    severity: DefectSeverity
    disposition?: DefectDisposition | null
  }[]
}

type InspectionSpecRecord = Awaited<ReturnType<typeof getInspectionSpecRecord>>
type QualityInspectionRecord = Awaited<ReturnType<typeof getQualityInspectionRecords>>[number]

function serializeInspectionSpec(spec: NonNullable<InspectionSpecRecord>): InspectionSpecWithItems {
  return {
    id: spec.id,
    tenantId: spec.tenantId,
    itemId: spec.itemId,
    routingOperationId: spec.routingOperationId,
    version: spec.version,
    status: spec.status,
    createdAt: spec.createdAt.toISOString(),
    updatedAt: spec.updatedAt.toISOString(),
    item: spec.item,
    routingOperation: spec.routingOperation,
    inspectionItems: spec.inspectionItems.map((item) => ({
      id: item.id,
      inspectionSpecId: item.inspectionSpecId,
      seq: item.seq,
      name: item.name,
      inputType: item.inputType,
      lowerLimit: item.lowerLimit == null ? null : Number(item.lowerLimit),
      upperLimit: item.upperLimit == null ? null : Number(item.upperLimit),
    })),
  }
}

function serializeQualityInspection(inspection: QualityInspectionRecord): QualityInspectionWithDetails {
  return {
    id: inspection.id,
    workOrderOperationId: inspection.workOrderOperationId,
    inspectionSpecId: inspection.inspectionSpecId,
    inspectorId: inspection.inspectorId,
    stage: inspection.stage,
    result: inspection.result,
    inspectedQty: Number(inspection.inspectedQty),
    inspectedAt: inspection.inspectedAt.toISOString(),
    workOrderOperation: {
      id: inspection.workOrderOperation.id,
      seq: inspection.workOrderOperation.seq,
      workOrderId: inspection.workOrderOperation.workOrderId,
      routingOperationId: inspection.workOrderOperation.routingOperationId,
      workOrder: {
        id: inspection.workOrderOperation.workOrder.id,
        orderNo: inspection.workOrderOperation.workOrder.orderNo,
        manufacturingNo: inspection.workOrderOperation.workOrder.manufacturingNo,
        item: inspection.workOrderOperation.workOrder.item,
      },
      routingOperation: inspection.workOrderOperation.routingOperation,
    },
    inspectionSpec: {
      id: inspection.inspectionSpec.id,
      version: inspection.inspectionSpec.version,
      item: inspection.inspectionSpec.item,
    },
    inspector: inspection.inspector,
    defectRecords: inspection.defectRecords.map((record) => ({
      id: record.id,
      qualityInspectionId: record.qualityInspectionId,
      defectCodeId: record.defectCodeId,
      qty: Number(record.qty),
      severity: record.severity,
      disposition: record.disposition,
      defectCode: record.defectCode,
    })),
  }
}

function revalidateQualityViews() {
  revalidatePath("/app/mes/inspection")
  revalidatePath("/app/mes/manufacturing-traceability")
}

async function getInspectionSpecRecord(routingOperationId: string, tenantId: string) {
  return prisma.inspectionSpec.findFirst({
    where: {
      tenantId,
      routingOperationId,
      status: "ACTIVE",
    },
    include: {
      item: { select: { id: true, code: true, name: true } },
      routingOperation: { select: { id: true, name: true, seq: true, routingId: true } },
      inspectionItems: { orderBy: { seq: "asc" } },
    },
  })
}

async function getQualityInspectionRecords(tenantId: string) {
  return prisma.qualityInspection.findMany({
    where: {
      workOrderOperation: {
        workOrder: { tenantId },
      },
    },
    include: {
      workOrderOperation: {
        include: {
          workOrder: {
            include: {
              item: { select: { code: true, name: true } },
            },
          },
          routingOperation: { select: { id: true, name: true, seq: true } },
        },
      },
      inspectionSpec: {
        include: {
          item: { select: { name: true } },
        },
      },
      inspector: { select: { id: true, name: true } },
      defectRecords: {
        include: {
          defectCode: {
            select: { id: true, code: true, name: true, defectCategory: true },
          },
        },
      },
    },
    orderBy: { inspectedAt: "desc" },
  })
}

export async function getDefectCodes(tenantId: string): Promise<DefectCodeRow[]> {
  return prisma.defectCode.findMany({
    where: { tenantId },
    orderBy: [{ defectCategory: "asc" }, { code: "asc" }],
  })
}

export async function createDefectCode(data: CreateDefectCodeInput, tenantId: string) {
  await requireRole("OPERATOR")
  const existing = await prisma.defectCode.findFirst({
    where: { tenantId, code: data.code },
  })
  if (existing) throw new Error(`Defect code '${data.code}' already exists.`)

  await prisma.defectCode.create({
    data: {
      tenantId,
      code: data.code,
      name: data.name,
      defectCategory: data.defectCategory,
    },
  })

  revalidatePath("/app/mes/defects")
}

export async function updateDefectCode(id: string, data: UpdateDefectCodeInput) {
  await requireRole("OPERATOR")
  await prisma.defectCode.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.defectCategory !== undefined && { defectCategory: data.defectCategory }),
    },
  })
  revalidatePath("/app/mes/defects")
}

export async function deleteDefectCode(id: string) {
  await requireRole("OPERATOR")
  const used = await prisma.defectRecord.count({ where: { defectCodeId: id } })
  if (used > 0) throw new Error("This defect code is used by inspection records.")

  await prisma.defectCode.delete({ where: { id } })
  revalidatePath("/app/mes/defects")
}

export type DefectCodeDeleteCandidate = {
  id: string
  code: string
  name: string
  canDelete: boolean
  reasons: string[]
}

/** 선택한 불량코드들의 삭제 가능 여부를 사전 확인한다(실제 삭제는 수행하지 않음). */
export async function bulkCheckDefectCodesForDelete(ids: string[]): Promise<DefectCodeDeleteCandidate[]> {
  await requireBulkDeletePermission()
  const tenantId = await getTenantId()
  if (ids.length === 0) return []

  const defectCodes = await prisma.defectCode.findMany({
    where: { id: { in: ids }, tenantId },
    select: { id: true, code: true, name: true },
  })

  const results = await Promise.all(
    defectCodes.map(async (d) => {
      const { canDelete, reasons } = await checkDefectCodeReferencesForBulk(d.id)
      return { id: d.id, code: d.code, name: d.name, canDelete, reasons }
    }),
  )

  const byId = new Map(results.map((r) => [r.id, r]))
  return ids.map((id) => byId.get(id)).filter((r): r is DefectCodeDeleteCandidate => Boolean(r))
}

export type BulkDeleteDefectCodesResult = {
  deleted: { id: string; code: string; name: string }[]
  blocked: { id: string; code: string; name: string; reasons: string[] }[]
  failed: { id: string; code: string; name: string; error: string }[]
}

/**
 * 선택한 불량코드 중 삭제 가능한 항목만 삭제한다.
 * race condition 방지를 위해 삭제 직전 항목별로 참조 여부를 다시 확인한다.
 */
export async function bulkDeleteDefectCodes(ids: string[]): Promise<BulkDeleteDefectCodesResult> {
  const actor = await requireBulkDeletePermission()
  const tenantId = await getTenantId()
  if (ids.length === 0) return { deleted: [], blocked: [], failed: [] }

  const defectCodes = await prisma.defectCode.findMany({ where: { id: { in: ids }, tenantId } })

  const deleted: BulkDeleteDefectCodesResult["deleted"] = []
  const blocked: BulkDeleteDefectCodesResult["blocked"] = []
  const failed: BulkDeleteDefectCodesResult["failed"] = []

  for (const d of defectCodes) {
    const { canDelete, reasons } = await checkDefectCodeReferencesForBulk(d.id)
    if (!canDelete) {
      blocked.push({ id: d.id, code: d.code, name: d.name, reasons })
      continue
    }
    try {
      await prisma.$transaction(async (tx) => {
        const result = await tx.defectCode.deleteMany({ where: { id: d.id, tenantId } })
        if (result.count === 0) throw new Error("NOT_FOUND")
        await tx.auditLog.create({
          data: {
            tenantId,
            actorId: actor.id,
            actorLabel: actor.name,
            entityType: "DefectCode",
            entityId: d.id,
            action: "DELETE",
            beforeData: { code: d.code, name: d.name, defectCategory: d.defectCategory },
            menuName: "불량코드 관리",
          },
        })
      })
      deleted.push({ id: d.id, code: d.code, name: d.name })
    } catch {
      failed.push({ id: d.id, code: d.code, name: d.name, error: "DELETE_FAILED" })
    }
  }

  revalidatePath("/app/mes/defects")
  return { deleted, blocked, failed }
}

export async function getInspectionSpecs(tenantId: string): Promise<InspectionSpecWithItems[]> {
  const specs = await prisma.inspectionSpec.findMany({
    where: { tenantId },
    include: {
      item: { select: { id: true, code: true, name: true } },
      routingOperation: { select: { id: true, name: true, seq: true, routingId: true } },
      inspectionItems: { orderBy: { seq: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  })
  return specs.map(serializeInspectionSpec)
}

export async function createInspectionSpec(
  data: CreateInspectionSpecInput,
  tenantId: string
) {
  await requireRole("OPERATOR")
  const existing = await prisma.inspectionSpec.findFirst({
    where: {
      tenantId,
      itemId: data.itemId,
      routingOperationId: data.routingOperationId,
      version: data.version,
    },
  })
  if (existing) throw new Error("The same item/process/version inspection spec already exists.")

  const created = await prisma.inspectionSpec.create({
    data: {
      tenantId,
      itemId: data.itemId,
      routingOperationId: data.routingOperationId,
      version: data.version,
      status: data.status,
    },
  })

  revalidatePath("/app/mes/measurement")
  revalidatePath("/app/mes/master/inspection-standards")
  return { id: created.id }
}

export async function updateInspectionSpec(id: string, data: UpdateInspectionSpecInput) {
  await requireRole("OPERATOR")
  await prisma.inspectionSpec.update({
    where: { id },
    data: {
      ...(data.version !== undefined && { version: data.version }),
      ...(data.status !== undefined && { status: data.status }),
    },
  })
  revalidatePath("/app/mes/measurement")
  revalidatePath("/app/mes/master/inspection-standards")
}

export async function deleteInspectionSpec(id: string) {
  await requireRole("OPERATOR")
  const used = await prisma.qualityInspection.count({ where: { inspectionSpecId: id } })
  if (used > 0) throw new Error("This inspection spec is used by inspection records.")

  await prisma.inspectionItem.deleteMany({ where: { inspectionSpecId: id } })
  await prisma.inspectionSpec.delete({ where: { id } })
  revalidatePath("/app/mes/measurement")
  revalidatePath("/app/mes/master/inspection-standards")
}

export async function upsertInspectionItems(
  inspectionSpecId: string,
  items: UpsertInspectionItemInput[]
) {
  await requireRole("OPERATOR")
  await prisma.inspectionItem.deleteMany({ where: { inspectionSpecId } })

  if (items.length > 0) {
    await prisma.inspectionItem.createMany({
      data: items.map((item) => ({
        inspectionSpecId,
        seq: item.seq,
        name: item.name,
        inputType: item.inputType,
        lowerLimit: item.lowerLimit ?? null,
        upperLimit: item.upperLimit ?? null,
      })),
    })
  }

  revalidatePath("/app/mes/measurement")
  revalidatePath("/app/mes/master/inspection-standards")
}

export async function deleteInspectionItem(id: string) {
  await requireRole("OPERATOR")
  await prisma.inspectionItem.delete({ where: { id } })
  revalidatePath("/app/mes/measurement")
  revalidatePath("/app/mes/master/inspection-standards")
}

export async function getQualityInspections(
  tenantId: string
): Promise<QualityInspectionWithDetails[]> {
  const inspections = await getQualityInspectionRecords(tenantId)
  return inspections.map(serializeQualityInspection)
}

export async function createQualityInspection(
  data: CreateQualityInspectionInput,
  tenantId: string
) {
  await requireRole("OPERATOR")

  const [operation, spec, inspector] = await Promise.all([
    prisma.workOrderOperation.findFirst({
      where: {
        id: data.workOrderOperationId,
        workOrder: { tenantId },
      },
      select: { routingOperationId: true },
    }),
    prisma.inspectionSpec.findFirst({
      where: {
        id: data.inspectionSpecId,
        tenantId,
        status: "ACTIVE",
      },
      select: { routingOperationId: true },
    }),
    prisma.profile.findFirst({
      where: {
        id: data.inspectorId,
        tenantUsers: { some: { tenantId, isActive: true } },
      },
      select: { id: true },
    }),
  ])

  if (!operation) throw new Error("Inspection target operation was not found.")
  if (!spec) throw new Error("Active inspection spec was not found.")
  if (!inspector) throw new Error("Inspector was not found.")
  if (spec.routingOperationId !== operation.routingOperationId) {
    throw new Error("Inspection spec does not match the selected operation.")
  }

  if (data.defectRecords.length > 0) {
    const defectCodeIds = Array.from(new Set(data.defectRecords.map((record) => record.defectCodeId)))
    const validDefectCodeCount = await prisma.defectCode.count({
      where: { tenantId, id: { in: defectCodeIds } },
    })
    if (validDefectCodeCount !== defectCodeIds.length) {
      throw new Error("One or more defect codes do not belong to this tenant.")
    }
  }

  const inspection = await prisma.qualityInspection.create({
    data: {
      workOrderOperationId: data.workOrderOperationId,
      inspectionSpecId: data.inspectionSpecId,
      inspectorId: data.inspectorId,
      result: data.result,
      inspectedQty: data.inspectedQty,
      inspectedAt: new Date(data.inspectedAt),
    },
  })

  if (data.defectRecords.length > 0) {
    await prisma.defectRecord.createMany({
      data: data.defectRecords.map((record) => ({
        qualityInspectionId: inspection.id,
        defectCodeId: record.defectCodeId,
        qty: record.qty,
        severity: record.severity,
        disposition: record.disposition ?? null,
      })),
    })
  }

  revalidateQualityViews()
}

export async function updateInspectionResult(id: string, result: InspectionResult) {
  await requireRole("OPERATOR")
  await prisma.qualityInspection.update({
    where: { id },
    data: { result },
  })
  revalidateQualityViews()
}

export async function deleteQualityInspection(id: string) {
  await requireRole("OPERATOR")
  await prisma.defectRecord.deleteMany({ where: { qualityInspectionId: id } })
  await prisma.qualityInspection.delete({ where: { id } })
  revalidateQualityViews()
}

export async function getItemsForQuality() {
  return prisma.item.findMany({
    select: { id: true, code: true, name: true },
    where: { status: "ACTIVE" },
    orderBy: { code: "asc" },
  })
}

export async function getRoutingOperationsForQuality(tenantId: string) {
  return prisma.routingOperation.findMany({
    where: { routing: { tenantId } },
    select: {
      id: true,
      name: true,
      seq: true,
      routingId: true,
      routing: { select: { id: true, code: true, name: true, version: true } },
    },
    orderBy: [{ routing: { code: "asc" } }, { seq: "asc" }],
  })
}

export type WorkOrderOperationForInspection = {
  id: string
  workOrderId: string
  routingOperationId: string
  seq: number
  status: string
  workOrder: {
    id: string
    orderNo: string
    manufacturingNo: string | null
    item: { code: string; name: string }
  }
  routingOperation: { id: string; name: string; seq: number }
}

export async function getWorkOrderOperationsForInspection(
  tenantId: string
): Promise<WorkOrderOperationForInspection[]> {
  const ops = await prisma.workOrderOperation.findMany({
    where: {
      workOrder: { tenantId },
      status: { in: ["IN_PROGRESS", "COMPLETED"] },
    },
    include: {
      workOrder: {
        include: {
          item: { select: { code: true, name: true } },
        },
      },
      routingOperation: { select: { id: true, name: true, seq: true } },
    },
    orderBy: { workOrder: { createdAt: "desc" } },
  })

  return ops.map((op) => ({
    id: op.id,
    workOrderId: op.workOrderId,
    routingOperationId: op.routingOperationId,
    seq: op.seq,
    status: op.status,
    workOrder: {
      id: op.workOrder.id,
      orderNo: op.workOrder.orderNo,
      manufacturingNo: op.workOrder.manufacturingNo,
      item: op.workOrder.item,
    },
    routingOperation: op.routingOperation,
  }))
}

export async function getInspectionSpecByOperation(
  routingOperationId: string,
  tenantId: string
): Promise<InspectionSpecWithItems | null> {
  const spec = await getInspectionSpecRecord(routingOperationId, tenantId)
  return spec ? serializeInspectionSpec(spec) : null
}

export async function getProfilesForInspection(tenantId: string) {
  return prisma.profile.findMany({
    where: { tenantUsers: { some: { tenantId, isActive: true } } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  })
}
