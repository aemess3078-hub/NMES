"use server"

import { prisma } from "@/lib/db/prisma"
import {
  ConnectionProtocol,
  TagDataType,
  TagCategory,
  GatewayStatus,
  Prisma,
} from "@prisma/client"
import { revalidatePath } from "next/cache"

// ─── Types ────────────────────────────────────────────────────────────────────

export type EdgeGatewayRow = {
  id: string
  tenantId: string
  siteId: string
  name: string
  description: string | null
  apiKey: string
  status: GatewayStatus
  lastHeartbeat: Date | null
  createdAt: Date
  updatedAt: Date
  site: { id: string; code: string; name: string }
  _count: { connections: number }
}

export type EquipmentConnectionRow = {
  id: string
  equipmentId: string
  gatewayId: string
  protocol: ConnectionProtocol
  host: string | null
  port: number | null
  config: any
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  equipment: { id: string; code: string; name: string }
  gateway: { id: string; name: string }
  _count: { tags: number }
}

export type DataTagRow = {
  id: string
  connectionId: string
  tagCode: string
  displayName: string
  dataType: TagDataType
  unit: string | null
  category: TagCategory
  plcAddress: string
  scaleFactor: any | null
  offset: any | null
  samplingMs: number
  deadband: any | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  connection: {
    id: string
    protocol: ConnectionProtocol
    equipment: { id: string; code: string; name: string }
    gateway: { id: string; name: string }
  }
}

// ─── Input Types ──────────────────────────────────────────────────────────────

export type CreateGatewayInput = {
  siteId: string
  name: string
  description?: string | null
}

export type UpdateGatewayInput = {
  name?: string
  description?: string | null
  status?: GatewayStatus
}

export type CreateConnectionInput = {
  equipmentId: string
  gatewayId: string
  protocol: ConnectionProtocol
  host?: string | null
  port?: number | null
  config?: Prisma.InputJsonValue | null
}

export type UpdateConnectionInput = {
  protocol?: ConnectionProtocol
  host?: string | null
  port?: number | null
  config?: Prisma.InputJsonValue | null
}

export type CreateTagInput = {
  connectionId: string
  tagCode: string
  displayName: string
  dataType: TagDataType
  unit?: string | null
  category: TagCategory
  plcAddress: string
  scaleFactor?: number | null
  offset?: number | null
  samplingMs?: number
  deadband?: number | null
}

export type UpdateTagInput = {
  displayName?: string
  dataType?: TagDataType
  unit?: string | null
  category?: TagCategory
  plcAddress?: string
  scaleFactor?: number | null
  offset?: number | null
  samplingMs?: number
  deadband?: number | null
}

// ─── EdgeGateway CRUD ─────────────────────────────────────────────────────────

export async function getGateways(tenantId: string): Promise<EdgeGatewayRow[]> {
  const rows = await prisma.edgeGateway.findMany({
    where: { tenantId },
    include: {
      site: { select: { id: true, code: true, name: true } },
      _count: { select: { connections: true } },
    },
    orderBy: { createdAt: "desc" },
  })
  return rows as any
}

export async function createGateway(
  data: CreateGatewayInput,
  tenantId: string
): Promise<{ id: string; apiKey: string }> {
  const gateway = await prisma.edgeGateway.create({
    data: {
      tenantId,
      siteId: data.siteId,
      name: data.name,
      description: data.description ?? null,
      status: "OFFLINE",
    },
    select: { id: true, apiKey: true },
  })
  revalidatePath("/app/mes/gateways")
  return gateway
}

export async function updateGateway(id: string, data: UpdateGatewayInput) {
  await prisma.edgeGateway.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.status !== undefined && { status: data.status }),
    },
  })
  revalidatePath("/app/mes/gateways")
}

export async function deleteGateway(id: string) {
  const connCount = await prisma.equipmentConnection.count({
    where: { gatewayId: id },
  })
  if (connCount > 0) {
    throw new Error("이 게이트웨이에 연결된 설비가 있어 삭제할 수 없습니다.")
  }
  await prisma.edgeGateway.delete({ where: { id } })
  revalidatePath("/app/mes/gateways")
}

// ─── EquipmentConnection CRUD ─────────────────────────────────────────────────

export async function getConnections(
  tenantId: string
): Promise<EquipmentConnectionRow[]> {
  const rows = await prisma.equipmentConnection.findMany({
    where: {
      equipment: { tenantId },
    },
    include: {
      equipment: { select: { id: true, code: true, name: true } },
      gateway: { select: { id: true, name: true } },
      _count: { select: { tags: true } },
    },
    orderBy: { createdAt: "desc" },
  })
  return rows as any
}

export async function createConnection(data: CreateConnectionInput) {
  const existing = await prisma.equipmentConnection.findUnique({
    where: {
      equipmentId_gatewayId: {
        equipmentId: data.equipmentId,
        gatewayId: data.gatewayId,
      },
    },
  })
  if (existing) {
    throw new Error("이 설비와 게이트웨이 조합의 연결이 이미 존재합니다.")
  }
  await prisma.equipmentConnection.create({
    data: {
      equipmentId: data.equipmentId,
      gatewayId: data.gatewayId,
      protocol: data.protocol,
      host: data.host ?? null,
      port: data.port ?? null,
      config: data.config ?? Prisma.JsonNull,
    },
  })
  revalidatePath("/app/mes/equipment-connections")
}

export async function updateConnection(
  id: string,
  data: UpdateConnectionInput
) {
  await prisma.equipmentConnection.update({
    where: { id },
    data: {
      ...(data.protocol !== undefined && { protocol: data.protocol }),
      ...(data.host !== undefined && { host: data.host }),
      ...(data.port !== undefined && { port: data.port }),
      ...(data.config !== undefined && { config: data.config ?? Prisma.JsonNull }),
    },
  })
  revalidatePath("/app/mes/equipment-connections")
}

export async function deleteConnection(id: string) {
  const tagCount = await prisma.dataTag.count({ where: { connectionId: id } })
  if (tagCount > 0) {
    throw new Error("이 연결에 등록된 태그가 있어 삭제할 수 없습니다.")
  }
  await prisma.equipmentConnection.delete({ where: { id } })
  revalidatePath("/app/mes/equipment-connections")
}

export async function toggleConnectionActive(id: string, isActive: boolean) {
  await prisma.equipmentConnection.update({
    where: { id },
    data: { isActive },
  })
  revalidatePath("/app/mes/equipment-connections")
}

// ─── DataTag CRUD ─────────────────────────────────────────────────────────────

export async function getTags(tenantId: string): Promise<DataTagRow[]> {
  const rows = await prisma.dataTag.findMany({
    where: {
      connection: {
        equipment: { tenantId },
      },
    },
    include: {
      connection: {
        select: {
          id: true,
          protocol: true,
          equipment: { select: { id: true, code: true, name: true } },
          gateway: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ connection: { equipment: { code: "asc" } } }, { tagCode: "asc" }],
  })
  return rows as any
}

export async function createTag(data: CreateTagInput) {
  const existing = await prisma.dataTag.findUnique({
    where: {
      connectionId_tagCode: {
        connectionId: data.connectionId,
        tagCode: data.tagCode,
      },
    },
  })
  if (existing) {
    throw new Error(`태그코드 '${data.tagCode}'는 이 연결에 이미 존재합니다.`)
  }
  await prisma.dataTag.create({
    data: {
      connectionId: data.connectionId,
      tagCode: data.tagCode,
      displayName: data.displayName,
      dataType: data.dataType,
      unit: data.unit ?? null,
      category: data.category,
      plcAddress: data.plcAddress,
      scaleFactor: data.scaleFactor ?? null,
      offset: data.offset ?? null,
      samplingMs: data.samplingMs ?? 1000,
      deadband: data.deadband ?? null,
    },
  })
  revalidatePath("/app/mes/tags")
}

export async function updateTag(id: string, data: UpdateTagInput) {
  await prisma.dataTag.update({
    where: { id },
    data: {
      ...(data.displayName !== undefined && { displayName: data.displayName }),
      ...(data.dataType !== undefined && { dataType: data.dataType }),
      ...(data.unit !== undefined && { unit: data.unit }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.plcAddress !== undefined && { plcAddress: data.plcAddress }),
      ...(data.scaleFactor !== undefined && { scaleFactor: data.scaleFactor }),
      ...(data.offset !== undefined && { offset: data.offset }),
      ...(data.samplingMs !== undefined && { samplingMs: data.samplingMs }),
      ...(data.deadband !== undefined && { deadband: data.deadband }),
    },
  })
  revalidatePath("/app/mes/tags")
}

export async function deleteTag(id: string) {
  await prisma.tagSnapshot.deleteMany({ where: { tagId: id } })
  await prisma.dataTag.delete({ where: { id } })
  revalidatePath("/app/mes/tags")
}

export async function toggleTagActive(id: string, isActive: boolean) {
  await prisma.dataTag.update({
    where: { id },
    data: { isActive },
  })
  revalidatePath("/app/mes/tags")
}

// ─── Lookup Helpers ───────────────────────────────────────────────────────────

export async function getSitesForGateway(tenantId: string) {
  return prisma.site.findMany({
    where: { tenantId },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  })
}

export async function getEquipmentsForConnection(tenantId: string) {
  return prisma.equipment.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: {
      id: true,
      code: true,
      name: true,
      workCenter: { select: { name: true } },
    },
    orderBy: { code: "asc" },
  })
}

export async function getGatewaysForConnection(tenantId: string) {
  return prisma.edgeGateway.findMany({
    where: { tenantId },
    select: { id: true, name: true, status: true },
    orderBy: { name: "asc" },
  })
}

export async function getConnectionsForTag(tenantId: string) {
  return prisma.equipmentConnection.findMany({
    where: {
      equipment: { tenantId },
      isActive: true,
    },
    select: {
      id: true,
      protocol: true,
      equipment: { select: { code: true, name: true } },
      gateway: { select: { name: true } },
    },
    orderBy: { equipment: { code: "asc" } },
  })
}
