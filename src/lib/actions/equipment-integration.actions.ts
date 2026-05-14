"use server"

import { requireTenantContext } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import {
  ConnectionProtocol,
  TagDataType,
  TagCategory,
  GatewayStatus,
  Prisma,
} from "@prisma/client"
import { revalidatePath } from "next/cache"

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

export async function getGateways(_tenantId?: string): Promise<EdgeGatewayRow[]> {
  const { tenantId } = await requireTenantContext()
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
  _tenantId?: string
): Promise<{ id: string; apiKey: string }> {
  const { tenantId } = await requireTenantContext()
  const site = await prisma.site.findFirst({
    where: { id: data.siteId, tenantId },
    select: { id: true },
  })

  if (!site) {
    throw new Error("Site not found in tenant scope")
  }

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
  const { tenantId } = await requireTenantContext()
  const result = await prisma.edgeGateway.updateMany({
    where: { id, tenantId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.status !== undefined && { status: data.status }),
    },
  })

  if (result.count === 0) {
    throw new Error("Gateway not found in tenant scope")
  }

  revalidatePath("/app/mes/gateways")
}

export async function deleteGateway(id: string) {
  const { tenantId } = await requireTenantContext()
  const connCount = await prisma.equipmentConnection.count({
    where: { gatewayId: id, gateway: { tenantId } },
  })
  if (connCount > 0) {
    throw new Error("Cannot delete gateway with active connections")
  }

  const result = await prisma.edgeGateway.deleteMany({ where: { id, tenantId } })
  if (result.count === 0) {
    throw new Error("Gateway not found in tenant scope")
  }

  revalidatePath("/app/mes/gateways")
}

export async function getConnections(
  _tenantId?: string
): Promise<EquipmentConnectionRow[]> {
  const { tenantId } = await requireTenantContext()
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
  const { tenantId } = await requireTenantContext()
  const [equipment, gateway, existing] = await Promise.all([
    prisma.equipment.findFirst({
      where: { id: data.equipmentId, tenantId },
      select: { id: true },
    }),
    prisma.edgeGateway.findFirst({
      where: { id: data.gatewayId, tenantId },
      select: { id: true },
    }),
    prisma.equipmentConnection.findUnique({
      where: {
        equipmentId_gatewayId: {
          equipmentId: data.equipmentId,
          gatewayId: data.gatewayId,
        },
      },
    }),
  ])

  if (!equipment || !gateway) {
    throw new Error("Connection target not found in tenant scope")
  }

  if (existing) {
    throw new Error("Connection already exists")
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
  const { tenantId } = await requireTenantContext()
  const result = await prisma.equipmentConnection.updateMany({
    where: { id, equipment: { tenantId } },
    data: {
      ...(data.protocol !== undefined && { protocol: data.protocol }),
      ...(data.host !== undefined && { host: data.host }),
      ...(data.port !== undefined && { port: data.port }),
      ...(data.config !== undefined && { config: data.config ?? Prisma.JsonNull }),
    },
  })

  if (result.count === 0) {
    throw new Error("Connection not found in tenant scope")
  }

  revalidatePath("/app/mes/equipment-connections")
}

export async function deleteConnection(id: string) {
  const { tenantId } = await requireTenantContext()
  const tagCount = await prisma.dataTag.count({
    where: { connectionId: id, connection: { equipment: { tenantId } } },
  })
  if (tagCount > 0) {
    throw new Error("Cannot delete connection with registered tags")
  }

  const result = await prisma.equipmentConnection.deleteMany({
    where: { id, equipment: { tenantId } },
  })
  if (result.count === 0) {
    throw new Error("Connection not found in tenant scope")
  }

  revalidatePath("/app/mes/equipment-connections")
}

export async function toggleConnectionActive(id: string, isActive: boolean) {
  const { tenantId } = await requireTenantContext()
  const result = await prisma.equipmentConnection.updateMany({
    where: { id, equipment: { tenantId } },
    data: { isActive },
  })
  if (result.count === 0) {
    throw new Error("Connection not found in tenant scope")
  }

  revalidatePath("/app/mes/equipment-connections")
}

export async function getTags(_tenantId?: string): Promise<DataTagRow[]> {
  const { tenantId } = await requireTenantContext()
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
  const { tenantId } = await requireTenantContext()
  const [connection, existing] = await Promise.all([
    prisma.equipmentConnection.findFirst({
      where: { id: data.connectionId, equipment: { tenantId } },
      select: { id: true },
    }),
    prisma.dataTag.findUnique({
      where: {
        connectionId_tagCode: {
          connectionId: data.connectionId,
          tagCode: data.tagCode,
        },
      },
    }),
  ])

  if (!connection) {
    throw new Error("Connection not found in tenant scope")
  }

  if (existing) {
    throw new Error("Tag code already exists on this connection")
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
  const { tenantId } = await requireTenantContext()
  const result = await prisma.dataTag.updateMany({
    where: { id, connection: { equipment: { tenantId } } },
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
  if (result.count === 0) {
    throw new Error("Tag not found in tenant scope")
  }

  revalidatePath("/app/mes/tags")
}

export async function deleteTag(id: string) {
  const { tenantId } = await requireTenantContext()
  await prisma.tagSnapshot.deleteMany({
    where: { tagId: id, tag: { connection: { equipment: { tenantId } } } },
  })
  const result = await prisma.dataTag.deleteMany({
    where: { id, connection: { equipment: { tenantId } } },
  })
  if (result.count === 0) {
    throw new Error("Tag not found in tenant scope")
  }

  revalidatePath("/app/mes/tags")
}

export async function toggleTagActive(id: string, isActive: boolean) {
  const { tenantId } = await requireTenantContext()
  const result = await prisma.dataTag.updateMany({
    where: { id, connection: { equipment: { tenantId } } },
    data: { isActive },
  })
  if (result.count === 0) {
    throw new Error("Tag not found in tenant scope")
  }

  revalidatePath("/app/mes/tags")
}

export async function getSitesForGateway(_tenantId?: string) {
  const { tenantId } = await requireTenantContext()
  return prisma.site.findMany({
    where: { tenantId },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  })
}

export async function getEquipmentsForConnection(_tenantId?: string) {
  const { tenantId } = await requireTenantContext()
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

export async function getGatewaysForConnection(_tenantId?: string) {
  const { tenantId } = await requireTenantContext()
  return prisma.edgeGateway.findMany({
    where: { tenantId },
    select: { id: true, name: true, status: true },
    orderBy: { name: "asc" },
  })
}

export async function getConnectionsForTag(_tenantId?: string) {
  const { tenantId } = await requireTenantContext()
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
