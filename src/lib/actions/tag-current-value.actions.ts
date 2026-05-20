"use server"

import { prisma } from "@/lib/db/prisma"

export type TagCurrentValueRow = {
  tagId: string
  tagCode: string
  displayName: string
  unit: string | null
  value: string
  numericValue: number | null
  quality: string
  timestamp: Date
  equipmentId: string
  equipmentName: string
}

// ─── Upsert latest value for a single tag ─────────────────────────────────────

export async function upsertTagCurrentValue(
  tagId: string,
  value: string,
  numericValue: number | null,
  quality: string,
  timestamp: Date
): Promise<void> {
  await prisma.tagCurrentValue.upsert({
    where: { tagId },
    update: { value, numericValue, quality, timestamp },
    create: { tagId, value, numericValue, quality, timestamp },
  })
}

// ─── Get current values for all tags of an equipment ──────────────────────────

export async function getCurrentTagValuesByEquipment(
  equipmentId: string
): Promise<TagCurrentValueRow[]> {
  const rows = await prisma.tagCurrentValue.findMany({
    where: {
      tag: {
        connection: { equipmentId },
        isActive: true,
      },
    },
    include: {
      tag: {
        select: {
          tagCode: true,
          displayName: true,
          unit: true,
          connection: {
            select: {
              equipment: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: { tag: { tagCode: "asc" } },
  })

  return rows.map((r) => ({
    tagId: r.tagId,
    tagCode: r.tag.tagCode,
    displayName: r.tag.displayName,
    unit: r.tag.unit,
    value: r.value,
    numericValue: r.numericValue !== null ? Number(r.numericValue) : null,
    quality: r.quality,
    timestamp: r.timestamp,
    equipmentId: r.tag.connection.equipment.id,
    equipmentName: r.tag.connection.equipment.name,
  }))
}

// ─── Get current values for a specific list of tagIds ─────────────────────────

export async function getCurrentTagValuesByTags(
  tagIds: string[]
): Promise<TagCurrentValueRow[]> {
  if (tagIds.length === 0) return []

  const rows = await prisma.tagCurrentValue.findMany({
    where: { tagId: { in: tagIds } },
    include: {
      tag: {
        select: {
          tagCode: true,
          displayName: true,
          unit: true,
          connection: {
            select: {
              equipment: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: { tag: { tagCode: "asc" } },
  })

  return rows.map((r) => ({
    tagId: r.tagId,
    tagCode: r.tag.tagCode,
    displayName: r.tag.displayName,
    unit: r.tag.unit,
    value: r.value,
    numericValue: r.numericValue !== null ? Number(r.numericValue) : null,
    quality: r.quality,
    timestamp: r.timestamp,
    equipmentId: r.tag.connection.equipment.id,
    equipmentName: r.tag.connection.equipment.name,
  }))
}
