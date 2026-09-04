"use server"

import { prisma } from "@/lib/db/prisma"
import { requireRole, getTenantId } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { getErrorMessage } from "@/lib/utils"
import { fetchSupabaseBackupsRaw } from "@/lib/supabase-management/backups"
import {
  parseSupabaseBackupsResponse,
  filterVisibleBackups,
  computeUnclassifiedBackups,
  computeMostRecentBackupAt,
  buildBackupLookup,
  serializeBackupGroupMember,
  dedupeBackupIds,
  type SupabaseBackupItem,
  type BackupSummary,
  type BackupGroupRow,
  type BackupGroupDetail,
} from "./backup.helpers"

export type { SupabaseBackupItem, BackupSummary, BackupGroupRow, BackupGroupDetail }

// ─── 청운커팅 사업계획서 "기준정보관리 > 백업관리" ──────────────────────────
//
// 이 파일은 Supabase 자동 DB 백업 목록을 "조회"하고, NMES 자체 metadata
// (BackupGroup/BackupGroupItem/HiddenBackup)로 그룹핑·숨김 처리하는 기능만
// 제공한다. Supabase backup 원본에 대한 생성/삭제/restore/PITR 호출은 이
// 파일은 물론 src/lib/supabase-management/backups.ts에도 전혀 없다(그 파일은
// GET 1개만 노출한다) — 그룹 삭제/백업 목록 삭제는 전부 NMES DB 안에서만
// 일어나는 mutation이다(§ STEP 27).
//
// Supabase 프로젝트는 tenant마다 별도가 아니라 하나이므로 백업 "목록" 자체는
// 모든 tenant에 동일하게 보이지만, 그룹/숨김 metadata는 tenantId로 분리한다
// (§ STEP 25).

const MENU_NAME = "백업관리"

function revalidateBackupPaths() {
  revalidatePath("/app/mes/backups")
}

async function loadHiddenIds(tenantId: string): Promise<Set<string>> {
  const rows = await prisma.hiddenBackup.findMany({ where: { tenantId }, select: { externalBackupId: true } })
  return new Set(rows.map((r) => r.externalBackupId))
}

function serializeGroupRow(group: {
  id: string
  name: string
  description: string | null
  createdAt: Date
  updatedAt: Date
  createdBy: { name: string }
  updatedBy: { name: string }
  _count: { items: number }
}): BackupGroupRow {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    memberCount: group._count.items,
    createdByName: group.createdBy.name,
    updatedByName: group.updatedBy.name,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  }
}

// ─── 조회 ─────────────────────────────────────────────────────────────────────

export type BackupManagementData = {
  available: boolean // Supabase Management API 연결 가능 여부(토큰 미설정/장애 시 false)
  summary: BackupSummary
  groups: BackupGroupRow[]
  unclassified: SupabaseBackupItem[]
  visibleBackups: SupabaseBackupItem[] // 그룹 등록/수정 다이얼로그의 선택 대상(전체 visible)
}

export async function getBackupManagementData(): Promise<BackupManagementData> {
  await requireRole("VIEWER")
  const tenantId = await getTenantId()

  const [rawResponse, groupRecords, hiddenIds, groupItemRows] = await Promise.all([
    fetchSupabaseBackupsRaw(),
    prisma.backupGroup.findMany({
      where: { tenantId },
      include: {
        createdBy: { select: { name: true } },
        updatedBy: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    loadHiddenIds(tenantId),
    prisma.backupGroupItem.findMany({ where: { tenantId }, select: { externalBackupId: true } }),
  ])

  const groups = groupRecords.map(serializeGroupRow)

  if (!rawResponse) {
    return {
      available: false,
      summary: {
        totalVisibleBackups: 0,
        groupCount: groups.length,
        mostRecentBackupAt: null,
        region: null,
        walgEnabled: null,
        pitrEnabled: null,
      },
      groups,
      unclassified: [],
      visibleBackups: [],
    }
  }

  const parsed = parseSupabaseBackupsResponse(rawResponse)
  const visible = filterVisibleBackups(parsed.backups, hiddenIds)
  const groupedIds = new Set(groupItemRows.map((r) => r.externalBackupId))
  const unclassified = computeUnclassifiedBackups(visible, groupedIds)

  return {
    available: true,
    summary: {
      totalVisibleBackups: visible.length,
      groupCount: groups.length,
      mostRecentBackupAt: computeMostRecentBackupAt(visible),
      region: parsed.region,
      walgEnabled: parsed.walgEnabled,
      pitrEnabled: parsed.pitrEnabled,
    },
    groups,
    unclassified,
    visibleBackups: visible,
  }
}

export async function getBackupGroupDetail(id: string): Promise<BackupGroupDetail | null> {
  await requireRole("VIEWER")
  const tenantId = await getTenantId()

  const group = await prisma.backupGroup.findFirst({
    where: { id, tenantId },
    include: {
      createdBy: { select: { name: true } },
      updatedBy: { select: { name: true } },
      items: { select: { externalBackupId: true }, orderBy: { createdAt: "asc" } },
    },
  })
  if (!group) return null

  const [rawResponse, hiddenIds] = await Promise.all([fetchSupabaseBackupsRaw(), loadHiddenIds(tenantId)])
  const lookup = rawResponse ? buildBackupLookup(parseSupabaseBackupsResponse(rawResponse).backups) : new Map()

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    memberCount: group.items.length,
    createdByName: group.createdBy.name,
    updatedByName: group.updatedBy.name,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
    members: group.items.map((i) => serializeBackupGroupMember(i.externalBackupId, lookup, hiddenIds)),
  }
}

// ─── 그룹 등록 ────────────────────────────────────────────────────────────────

export type CreateBackupGroupInput = {
  name: string
  description?: string | null
  externalBackupIds: string[]
}

export async function createBackupGroup(data: CreateBackupGroupInput): Promise<{ id: string }> {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  const name = data.name.trim()
  if (!name) throw new Error("그룹명을 입력해 주세요.")
  const ids = dedupeBackupIds(data.externalBackupIds)
  if (ids.length === 0) throw new Error("백업을 1개 이상 선택해 주세요.")
  const description = data.description?.trim() || null

  const created = await prisma.$transaction(async (tx) => {
    const group = await tx.backupGroup.create({
      data: { tenantId, name, description, createdById: actor.id, updatedById: actor.id },
    })
    await tx.backupGroupItem.createMany({
      data: ids.map((externalBackupId) => ({ tenantId, groupId: group.id, externalBackupId })),
    })
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId: actor.id,
        actorLabel: actor.name,
        entityType: "BackupGroup",
        entityId: group.id,
        action: "CREATE",
        afterData: { name, description, backupCount: ids.length },
        menuName: MENU_NAME,
      },
    })
    return group
  })

  revalidateBackupPaths()
  return { id: created.id }
}

// ─── 그룹 수정 ────────────────────────────────────────────────────────────────
//
// 이름/설명/포함 백업(전체 교체 방식)만 수정 가능 — Supabase backup 자체의
// 생성시간/상태/ID/물리·논리 유형은 이 함수에서 건드리지 않는다(애초에 그런
// 필드가 이 모델에 없음, § STEP 10).

export type UpdateBackupGroupInput = {
  name: string
  description?: string | null
  externalBackupIds: string[]
}

export async function updateBackupGroup(id: string, data: UpdateBackupGroupInput) {
  const actor = await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  const existing = await prisma.backupGroup.findFirst({ where: { id, tenantId } })
  if (!existing) throw new Error("그룹을 찾을 수 없습니다.")

  const name = data.name.trim()
  if (!name) throw new Error("그룹명을 입력해 주세요.")
  const ids = dedupeBackupIds(data.externalBackupIds)
  if (ids.length === 0) throw new Error("백업을 1개 이상 선택해 주세요.")
  const description = data.description?.trim() || null

  await prisma.$transaction(async (tx) => {
    await tx.backupGroup.update({ where: { id }, data: { name, description, updatedById: actor.id } })
    await tx.backupGroupItem.deleteMany({ where: { groupId: id } })
    await tx.backupGroupItem.createMany({
      data: ids.map((externalBackupId) => ({ tenantId, groupId: id, externalBackupId })),
    })
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId: actor.id,
        actorLabel: actor.name,
        entityType: "BackupGroup",
        entityId: id,
        action: "UPDATE",
        beforeData: { name: existing.name, description: existing.description },
        afterData: { name, description, backupCount: ids.length },
        menuName: MENU_NAME,
      },
    })
  })

  revalidateBackupPaths()
}

// ─── 그룹 삭제 — BackupGroupItem은 cascade, Supabase backup 원본은 무관 ──────

export async function deleteBackupGroup(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireRole("OPERATOR")
    const tenantId = await getTenantId()

    const existing = await prisma.backupGroup.findFirst({ where: { id, tenantId } })
    if (!existing) throw new Error("그룹을 찾을 수 없습니다.")

    await prisma.$transaction(async (tx) => {
      const result = await tx.backupGroup.deleteMany({ where: { id, tenantId } })
      if (result.count === 0) throw new Error("그룹을 찾을 수 없습니다.")
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actor.id,
          actorLabel: actor.name,
          entityType: "BackupGroup",
          entityId: id,
          action: "DELETE",
          beforeData: { name: existing.name, description: existing.description },
          menuName: MENU_NAME,
        },
      })
    })

    revalidateBackupPaths()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: getErrorMessage(e) }
  }
}

// ─── 백업 목록 삭제(NMES 화면에서만 숨김) — Supabase backup 원본 mutation 없음 ─

export async function hideBackup(externalBackupId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireRole("OPERATOR")
    const tenantId = await getTenantId()

    const id = externalBackupId.trim()
    if (!id) throw new Error("백업을 확인할 수 없습니다.")

    const existing = await prisma.hiddenBackup.findFirst({ where: { tenantId, externalBackupId: id } })
    if (!existing) {
      await prisma.$transaction(async (tx) => {
        const hidden = await tx.hiddenBackup.create({
          data: { tenantId, externalBackupId: id, hiddenById: actor.id },
        })
        await tx.auditLog.create({
          data: {
            tenantId,
            actorId: actor.id,
            actorLabel: actor.name,
            entityType: "HiddenBackup",
            entityId: hidden.id,
            action: "CREATE",
            afterData: { externalBackupId: id },
            menuName: MENU_NAME,
          },
        })
      })
    }

    revalidateBackupPaths()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: getErrorMessage(e) }
  }
}
