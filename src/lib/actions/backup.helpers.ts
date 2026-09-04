import type { SupabaseBackupsApiResponse } from "../supabase-management/backups"

// backup.actions.ts("use server")는 async export만 허용되므로, DB/네트워크에
// 의존하지 않는 순수 파싱/정규화/집계 로직을 이 파일로 분리한다
// (defect-corrective-action.helpers.ts와 동일한 이유). Supabase API 자체를
// 호출하지 않으므로 여기서는 fabricated response로도 안전하게 테스트할 수
// 있다(scripts/test-backup-management.ts 참조).

/** 그룹 등록/수정 입력의 externalBackupIds를 정리한다 — 빈 값 제거 + 중복 제거(같은 그룹 내 중복 방지). */
export function dedupeBackupIds(ids: string[]): string[] {
  return Array.from(new Set(ids.map((s) => s.trim()).filter(Boolean)))
}

// ─── 백업 식별자 정규화 ───────────────────────────────────────────────────────

/**
 * Supabase 응답의 개별 backup item에 안정적인 id 필드가 있는지 이 환경에서는
 * 실제로 검증하지 못했다(§ STEP 4/32). id가 있으면 그 값을(숫자든 문자열이든
 * 문자열로 변환), 없으면 inserted_at(해당 프로젝트의 자동 백업이라면 시각
 * 자체가 고유한 식별자 역할을 함)을 사용해 어느 쪽이든 API 응답 구조 변경에
 * 강하게 의존하지 않게 한다(§ STEP 13).
 */
export function normalizeExternalBackupId(raw: { id?: string | number; inserted_at?: string }): string | null {
  if (raw.id !== undefined && raw.id !== null && String(raw.id).trim()) {
    return String(raw.id)
  }
  if (raw.inserted_at && raw.inserted_at.trim()) {
    return raw.inserted_at
  }
  return null
}

// ─── Supabase 응답 파싱 ───────────────────────────────────────────────────────

export type SupabaseBackupItem = {
  externalBackupId: string
  status: string
  insertedAt: string // ISO
  isPhysicalBackup: boolean | null
}

export type ParsedSupabaseBackups = {
  backups: SupabaseBackupItem[]
  region: string | null
  walgEnabled: boolean | null
  pitrEnabled: boolean | null
}

/**
 * Supabase Management API 응답을 파싱한다. id/inserted_at이 모두 없어 식별
 * 불가능한 항목은 조용히 건너뛴다(화면에 표시할 방법이 없는 항목을 억지로
 * 만들어내지 않음 — § STEP 7 "임의 백업명 등을 만들어내지 않는다"와 동일 원칙).
 */
export function parseSupabaseBackupsResponse(response: SupabaseBackupsApiResponse): ParsedSupabaseBackups {
  const backups: SupabaseBackupItem[] = []
  for (const raw of response.backups ?? []) {
    const externalBackupId = normalizeExternalBackupId(raw)
    if (!externalBackupId || !raw.inserted_at) continue
    backups.push({
      externalBackupId,
      status: raw.status ?? "UNKNOWN",
      insertedAt: raw.inserted_at,
      isPhysicalBackup: raw.is_physical_backup ?? null,
    })
  }
  return {
    backups,
    region: response.region ?? null,
    walgEnabled: response.walg_enabled ?? null,
    pitrEnabled: response.pitr_enabled ?? null,
  }
}

// ─── 가시성 필터링 (숨김/미분류) ──────────────────────────────────────────────

/** HiddenBackup에 없는 backup만 남긴다 — 실제 Supabase backup은 그대로, NMES 화면에서만 제외. */
export function filterVisibleBackups(all: SupabaseBackupItem[], hiddenIds: Set<string>): SupabaseBackupItem[] {
  return all.filter((b) => !hiddenIds.has(b.externalBackupId))
}

/** 어느 그룹에도 포함되지 않은(visible) backup만 "미분류"로 남긴다. 같은 backup이 여러 그룹에 속할 수 있다는 점은 groupedIds가 Set이라 자연히 반영된다. */
export function computeUnclassifiedBackups(visible: SupabaseBackupItem[], groupedIds: Set<string>): SupabaseBackupItem[] {
  return visible.filter((b) => !groupedIds.has(b.externalBackupId))
}

/** 알 수 없는(존재하지 않게 된) externalBackupId를 가진 그룹 멤버십도 안전하게 표시하기 위한 조회용 맵 빌더. */
export function buildBackupLookup(backups: SupabaseBackupItem[]): Map<string, SupabaseBackupItem> {
  return new Map(backups.map((b) => [b.externalBackupId, b]))
}

// ─── 요약 통계 ────────────────────────────────────────────────────────────────

export type BackupSummary = {
  totalVisibleBackups: number
  groupCount: number
  mostRecentBackupAt: string | null // ISO
  region: string | null
  walgEnabled: boolean | null
  pitrEnabled: boolean | null
}

export function computeMostRecentBackupAt(backups: SupabaseBackupItem[]): string | null {
  if (backups.length === 0) return null
  return backups.reduce((latest, b) => (b.insertedAt > latest ? b.insertedAt : latest), backups[0].insertedAt)
}

// ─── 그룹 직렬화 ──────────────────────────────────────────────────────────────

export type BackupGroupMemberRow = {
  externalBackupId: string
  status: string | null // 실제 Supabase 목록에서 사라졌으면(삭제/보존기간 만료 등) null — graceful 처리(§ STEP 30 T19)
  insertedAt: string | null
  isPhysicalBackup: boolean | null
  hidden: boolean
}

export type BackupGroupRow = {
  id: string
  name: string
  description: string | null
  memberCount: number
  createdByName: string
  updatedByName: string
  createdAt: string
  updatedAt: string
}

export type BackupGroupDetail = BackupGroupRow & {
  members: BackupGroupMemberRow[]
}

export function serializeBackupGroupMember(
  externalBackupId: string,
  lookup: Map<string, SupabaseBackupItem>,
  hiddenIds: Set<string>
): BackupGroupMemberRow {
  const found = lookup.get(externalBackupId)
  return {
    externalBackupId,
    status: found?.status ?? null,
    insertedAt: found?.insertedAt ?? null,
    isPhysicalBackup: found?.isPhysicalBackup ?? null,
    hidden: hiddenIds.has(externalBackupId),
  }
}
