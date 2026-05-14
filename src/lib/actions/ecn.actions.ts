"use server"

import { requireTenantContext } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { ECNStatus } from "@prisma/client"
import { revalidatePath } from "next/cache"

export type ECNDetail = {
  id: string
  engineeringChangeId: string
  changeTarget: string
  actionType: string
  beforeValue: any
  afterValue: any
  description: string | null
}

export type ECNWithDetails = {
  id: string
  tenantId: string
  ecnNo: string
  title: string
  reason: string
  changeType: string
  targetItemId: string
  status: ECNStatus
  requestedBy: string
  approvedBy: string | null
  requestedAt: Date
  approvedAt: Date | null
  implementedAt: Date | null
  note: string | null
  createdAt: Date
  updatedAt: Date
  item: { id: string; code: string; name: string; itemType: string }
  requester: { id: string; name: string; email: string }
  approver: { id: string; name: string; email: string } | null
  details: ECNDetail[]
}

const ECN_INCLUDE = {
  item: { select: { id: true, code: true, name: true, itemType: true } },
  requester: { select: { id: true, name: true, email: true } },
  approver: { select: { id: true, name: true, email: true } },
  details: true,
} as const

async function generateECNNo(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `ECN-${year}-`
  const last = await prisma.engineeringChange.findFirst({
    where: { tenantId, ecnNo: { startsWith: prefix } },
    orderBy: { ecnNo: "desc" },
    select: { ecnNo: true },
  })
  const seq = last ? (parseInt(last.ecnNo.split("-")[2] ?? "0", 10) || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(3, "0")}`
}

export async function getECNs(): Promise<ECNWithDetails[]> {
  const { tenantId } = await requireTenantContext()
  const results = await prisma.engineeringChange.findMany({
    where: { tenantId },
    include: ECN_INCLUDE,
    orderBy: { createdAt: "desc" },
  })
  return results as any
}

export async function getECNById(id: string): Promise<ECNWithDetails | null> {
  const { tenantId } = await requireTenantContext()
  const result = await prisma.engineeringChange.findFirst({
    where: { id, tenantId },
    include: ECN_INCLUDE,
  })
  return result as any
}

export async function getItemsForECN() {
  const { tenantId } = await requireTenantContext()
  return prisma.item.findMany({
    where: {
      tenantId,
      itemType: { in: ["FINISHED", "SEMI_FINISHED"] },
      status: "ACTIVE",
    },
    select: { id: true, code: true, name: true, itemType: true },
    orderBy: { name: "asc" },
  })
}

export async function getCurrentBOM(itemId: string) {
  const { tenantId } = await requireTenantContext()
  return prisma.bOM.findFirst({
    where: { tenantId, itemId, status: "ACTIVE" },
    include: {
      bomItems: {
        include: { componentItem: { select: { id: true, code: true, name: true, uom: true } } },
        orderBy: { seq: "asc" },
      },
    },
  })
}

export async function getCurrentRouting(itemId: string) {
  const { tenantId } = await requireTenantContext()
  const itemRouting = await prisma.itemRouting.findFirst({
    where: {
      tenantId,
      itemId,
      isDefault: true,
      routing: { status: "ACTIVE", tenantId },
    },
    include: {
      routing: {
        include: {
          operations: {
            include: { workCenter: { select: { id: true, code: true, name: true } } },
            orderBy: { seq: "asc" },
          },
        },
      },
    },
  })
  return itemRouting?.routing ?? null
}

export type ECNDetailInput = {
  changeTarget: string
  actionType: string
  beforeValue?: any
  afterValue?: any
  description?: string
}

export type CreateECNInput = {
  title: string
  reason: string
  changeType: string
  targetItemId: string
  note?: string
  details: ECNDetailInput[]
}

export async function createECN(data: CreateECNInput, _tenantId: string, _requestedBy: string) {
  const { tenantId, userId } = await requireTenantContext()
  const item = await prisma.item.findFirst({
    where: { id: data.targetItemId, tenantId },
    select: { id: true },
  })
  if (!item) throw new Error("Target item not found in tenant scope")

  const ecnNo = await generateECNNo(tenantId)
  await prisma.engineeringChange.create({
    data: {
      tenantId,
      ecnNo,
      title: data.title,
      reason: data.reason,
      changeType: data.changeType,
      targetItemId: data.targetItemId,
      status: "DRAFT",
      requestedBy: userId,
      note: data.note,
      details: {
        create: data.details.map((d) => ({
          changeTarget: d.changeTarget,
          actionType: d.actionType,
          beforeValue: d.beforeValue,
          afterValue: d.afterValue,
          description: d.description,
        })),
      },
    },
  })
  revalidatePath("/app/mes/ecn")
}

export async function updateECN(id: string, data: CreateECNInput) {
  const { tenantId } = await requireTenantContext()
  const current = await prisma.engineeringChange.findFirstOrThrow({
    where: { id, tenantId },
  })
  if (!["DRAFT", "SUBMITTED"].includes(current.status)) {
    throw new Error("Only draft or submitted ECNs can be edited")
  }
  await prisma.$transaction([
    prisma.engineeringChangeDetail.deleteMany({
      where: { engineeringChangeId: id, engineeringChange: { tenantId } },
    }),
    prisma.engineeringChange.update({
      where: { id: current.id },
      data: {
        title: data.title,
        reason: data.reason,
        changeType: data.changeType,
        targetItemId: data.targetItemId,
        note: data.note,
        details: {
          create: data.details.map((d) => ({
            changeTarget: d.changeTarget,
            actionType: d.actionType,
            beforeValue: d.beforeValue,
            afterValue: d.afterValue,
            description: d.description,
          })),
        },
      },
    }),
  ])
  revalidatePath("/app/mes/ecn")
}

export async function deleteECN(id: string) {
  const { tenantId } = await requireTenantContext()
  const current = await prisma.engineeringChange.findFirstOrThrow({
    where: { id, tenantId },
  })
  if (current.status !== "DRAFT") {
    throw new Error("Only draft ECNs can be deleted")
  }
  await prisma.$transaction([
    prisma.engineeringChangeDetail.deleteMany({
      where: { engineeringChangeId: id, engineeringChange: { tenantId } },
    }),
    prisma.engineeringChange.delete({ where: { id: current.id } }),
  ])
  revalidatePath("/app/mes/ecn")
}

export async function submitECN(id: string) {
  const { tenantId } = await requireTenantContext()
  const current = await prisma.engineeringChange.findFirstOrThrow({
    where: { id, tenantId },
  })
  if (current.status !== "DRAFT") throw new Error("Only draft ECNs can be submitted")
  await prisma.engineeringChange.update({
    where: { id: current.id },
    data: { status: "SUBMITTED" },
  })
  revalidatePath("/app/mes/ecn")
}

export async function approveECN(id: string, _approvedBy: string) {
  const { tenantId, userId } = await requireTenantContext()
  const current = await prisma.engineeringChange.findFirstOrThrow({
    where: { id, tenantId },
  })
  if (!["SUBMITTED", "REVIEWING"].includes(current.status)) {
    throw new Error("Only submitted or reviewing ECNs can be approved")
  }
  await prisma.engineeringChange.update({
    where: { id: current.id },
    data: { status: "APPROVED", approvedBy: userId, approvedAt: new Date() },
  })
  revalidatePath("/app/mes/ecn")
}

export async function rejectECN(id: string, _approvedBy: string) {
  const { tenantId, userId } = await requireTenantContext()
  const current = await prisma.engineeringChange.findFirstOrThrow({
    where: { id, tenantId },
  })
  if (!["SUBMITTED", "REVIEWING"].includes(current.status)) {
    throw new Error("Only submitted or reviewing ECNs can be rejected")
  }
  await prisma.engineeringChange.update({
    where: { id: current.id },
    data: { status: "REJECTED", approvedBy: userId, approvedAt: new Date() },
  })
  revalidatePath("/app/mes/ecn")
}

export async function implementECN(id: string) {
  const { tenantId } = await requireTenantContext()
  const ecn = await prisma.engineeringChange.findFirstOrThrow({
    where: { id, tenantId },
    include: { details: true },
  })
  if (ecn.status !== "APPROVED") {
    throw new Error("Only approved ECNs can be implemented")
  }

  await prisma.$transaction(async (tx) => {
    if (ecn.changeType === "BOM" || ecn.changeType === "BOTH") {
      const currentBOM = await tx.bOM.findFirst({
        where: { itemId: ecn.targetItemId, status: "ACTIVE", tenantId },
        include: { bomItems: true },
      })
      if (currentBOM) {
        await tx.bOM.update({ where: { id: currentBOM.id }, data: { status: "INACTIVE" } })
        const versionNum = parseFloat(currentBOM.version) || 1
        const newVersion = (versionNum + 1).toFixed(1)

        const afterValueDetails = ecn.details.filter(
          (d) => d.changeTarget === "BOM_ITEM" && d.afterValue
        )
        let newBomItems: any[]
        if (afterValueDetails.length > 0) {
          newBomItems = afterValueDetails.map((d: any, idx: number) => ({
            componentItemId: d.afterValue.componentItemId ?? currentBOM.bomItems[idx]?.componentItemId,
            seq: d.afterValue.seq ?? idx + 1,
            qtyPer: d.afterValue.qtyPer ?? 1,
            scrapRate: d.afterValue.scrapRate ?? 0,
          }))
        } else {
          newBomItems = currentBOM.bomItems.map((bi) => ({
            componentItemId: bi.componentItemId,
            seq: bi.seq,
            qtyPer: bi.qtyPer,
            scrapRate: bi.scrapRate,
          }))
        }

        await tx.bOM.create({
          data: {
            tenantId: ecn.tenantId,
            itemId: ecn.targetItemId,
            version: newVersion,
            isDefault: true,
            status: "ACTIVE",
            bomItems: { create: newBomItems },
          },
        })
      }
    }

    if (ecn.changeType === "ROUTING" || ecn.changeType === "BOTH") {
      const currentItemRouting = await tx.itemRouting.findFirst({
        where: {
          itemId: ecn.targetItemId,
          tenantId,
          isDefault: true,
          routing: { status: "ACTIVE", tenantId },
        },
        include: { routing: { include: { operations: true } } },
      })
      if (currentItemRouting) {
        const currentRouting = currentItemRouting.routing
        await tx.routing.update({ where: { id: currentRouting.id }, data: { status: "INACTIVE" } })
        const versionNum = parseFloat(currentRouting.version) || 1
        const newVersion = (versionNum + 1).toFixed(1)

        const newOps = currentRouting.operations.map((op) => ({
          seq: op.seq,
          operationCode: op.operationCode,
          name: op.name,
          workCenterId: op.workCenterId,
          standardTime: op.standardTime,
        }))

        const newRouting = await tx.routing.create({
          data: {
            tenantId: ecn.tenantId,
            code: currentRouting.code + "-V" + newVersion.replace(".", ""),
            name: currentRouting.name,
            version: newVersion,
            status: "ACTIVE",
            operations: { create: newOps },
          },
        })

        await tx.itemRouting.update({
          where: { id: currentItemRouting.id },
          data: { isDefault: false },
        })
        await tx.itemRouting.create({
          data: {
            tenantId: ecn.tenantId,
            itemId: ecn.targetItemId,
            routingId: newRouting.id,
            isDefault: true,
          },
        })
      }
    }

    await tx.engineeringChange.update({
      where: { id: ecn.id },
      data: { status: "IMPLEMENTED", implementedAt: new Date() },
    })

    await tx.auditLog.create({
      data: {
        tenantId: ecn.tenantId,
        actorId: ecn.requestedBy,
        actorType: "USER",
        entityType: "EngineeringChange",
        entityId: id,
        action: "UPDATE",
        afterData: { ecnNo: ecn.ecnNo, changeType: ecn.changeType, status: "IMPLEMENTED" },
      },
    })
  })

  revalidatePath("/app/mes/ecn")
}
