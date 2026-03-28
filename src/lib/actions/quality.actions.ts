"use server"

import { prisma } from "@/lib/db/prisma"
import {
  InspectionSpecStatus,
  InspectionInputType,
  InspectionResult,
  DefectCategory,
  DefectSeverity,
  DefectDisposition,
} from "@prisma/client"
import { revalidatePath } from "next/cache"

// ─── Types ────────────────────────────────────────────────────────────────────

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
  createdAt: Date
  updatedAt: Date
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
  lowerLimit: any | null
  upperLimit: any | null
}

export type QualityInspectionWithDetails = {
  id: string
  workOrderOperationId: string
  inspectionSpecId: string
  inspectorId: string
  result: InspectionResult | null
  inspectedQty: any
  inspectedAt: Date
  workOrderOperation: {
    id: string
    seq: number
    workOrderId: string
    routingOperationId: string
    workOrder: { id: string; orderNo: string; item: { code: string; name: string } }
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
  qty: any
  severity: DefectSeverity
  disposition: DefectDisposition | null
  defectCode: { id: string; code: string; name: string; defectCategory: DefectCategory }
}

// ─── Input Types ──────────────────────────────────────────────────────────────

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

// ─── DefectCode CRUD ──────────────────────────────────────────────────────────

export async function getDefectCodes(tenantId: string): Promise<DefectCodeRow[]> {
  return prisma.defectCode.findMany({
    where: { tenantId },
    orderBy: [{ defectCategory: "asc" }, { code: "asc" }],
  })
}

export async function createDefectCode(data: CreateDefectCodeInput, tenantId: string) {
  const existing = await prisma.defectCode.findFirst({
    where: { tenantId, code: data.code },
  })
  if (existing) {
    throw new Error(`불량코드 '${data.code}'는 이미 존재합니다.`)
  }

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
  const used = await prisma.defectRecord.count({ where: { defectCodeId: id } })
  if (used > 0) {
    throw new Error("이 불량코드는 검사 기록에서 사용 중이라 삭제할 수 없습니다.")
  }
  await prisma.defectCode.delete({ where: { id } })
  revalidatePath("/app/mes/defects")
}

// ─── InspectionSpec CRUD ──────────────────────────────────────────────────────

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
  return specs as any
}

export async function createInspectionSpec(
  data: CreateInspectionSpecInput,
  tenantId: string
) {
  const existing = await prisma.inspectionSpec.findFirst({
    where: {
      tenantId,
      itemId: data.itemId,
      routingOperationId: data.routingOperationId,
      version: data.version,
    },
  })
  if (existing) {
    throw new Error("동일한 품목·공정·버전 조합의 검사기준이 이미 존재합니다.")
  }

  await prisma.inspectionSpec.create({
    data: {
      tenantId,
      itemId: data.itemId,
      routingOperationId: data.routingOperationId,
      version: data.version,
      status: data.status,
    },
  })

  revalidatePath("/app/mes/measurement")
}

export async function updateInspectionSpec(id: string, data: UpdateInspectionSpecInput) {
  await prisma.inspectionSpec.update({
    where: { id },
    data: {
      ...(data.version !== undefined && { version: data.version }),
      ...(data.status !== undefined && { status: data.status }),
    },
  })
  revalidatePath("/app/mes/measurement")
}

export async function deleteInspectionSpec(id: string) {
  const used = await prisma.qualityInspection.count({ where: { inspectionSpecId: id } })
  if (used > 0) {
    throw new Error("이 검사기준은 품질검사에서 사용 중이라 삭제할 수 없습니다.")
  }
  // Cascade delete items first
  await prisma.inspectionItem.deleteMany({ where: { inspectionSpecId: id } })
  await prisma.inspectionSpec.delete({ where: { id } })
  revalidatePath("/app/mes/measurement")
}

// ─── InspectionItem CRUD ──────────────────────────────────────────────────────

export async function upsertInspectionItems(
  inspectionSpecId: string,
  items: UpsertInspectionItemInput[]
) {
  // Replace all items for this spec
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
}

export async function deleteInspectionItem(id: string) {
  await prisma.inspectionItem.delete({ where: { id } })
  revalidatePath("/app/mes/measurement")
}

// ─── QualityInspection CRUD ───────────────────────────────────────────────────

export async function getQualityInspections(
  tenantId: string
): Promise<QualityInspectionWithDetails[]> {
  const inspections = await prisma.qualityInspection.findMany({
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
  return inspections as any
}

export async function createQualityInspection(
  data: CreateQualityInspectionInput,
  tenantId: string
) {
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
      data: data.defectRecords.map((dr) => ({
        qualityInspectionId: inspection.id,
        defectCodeId: dr.defectCodeId,
        qty: dr.qty,
        severity: dr.severity,
        disposition: dr.disposition ?? null,
      })),
    })
  }

  revalidatePath("/app/mes/inspection")
}

export async function updateInspectionResult(id: string, result: InspectionResult) {
  await prisma.qualityInspection.update({
    where: { id },
    data: { result },
  })
  revalidatePath("/app/mes/inspection")
}

export async function deleteQualityInspection(id: string) {
  await prisma.defectRecord.deleteMany({ where: { qualityInspectionId: id } })
  await prisma.qualityInspection.delete({ where: { id } })
  revalidatePath("/app/mes/inspection")
}

// ─── Lookup helpers ───────────────────────────────────────────────────────────

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
  return ops as any
}

export async function getInspectionSpecByOperation(
  routingOperationId: string,
  tenantId: string
): Promise<InspectionSpecWithItems | null> {
  const spec = await prisma.inspectionSpec.findFirst({
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
  return spec as any
}

export async function getProfilesForInspection() {
  return prisma.profile.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  })
}
