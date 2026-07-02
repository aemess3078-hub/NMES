// 기준정보 선택 일괄삭제 공통 유틸 — 품목/거래처/고객사/라우팅 등 여러 메뉴에서 재사용한다.

export type ReferenceCheckResult = {
  canDelete: boolean
  reasons: string[]
}

export type ReferenceCheckDefinition = {
  label: string
  count: () => Promise<number>
}

/** 참조 카운트들을 병렬로 조회해 "N건" 형태의 삭제 불가 사유 목록을 만든다. */
export async function buildReferenceCheck(
  checks: ReferenceCheckDefinition[],
): Promise<ReferenceCheckResult> {
  const counts = await Promise.all(checks.map((c) => c.count()))
  const reasons: string[] = []
  checks.forEach((c, i) => {
    if (counts[i] > 0) reasons.push(`${c.label} ${counts[i]}건`)
  })
  return { canDelete: reasons.length === 0, reasons }
}

export type BulkDeletable = { id: string; code: string; name: string }

export type BulkDeleteOutcome = {
  deleted: BulkDeletable[]
  blocked: (BulkDeletable & { reasons: string[] })[]
  failed: (BulkDeletable & { error: string })[]
}

/**
 * 참조 확인 → 삭제 가능한 항목만 개별 삭제를 순차 수행한다.
 * 항목별로 독립적으로 처리하므로 하나가 실패해도 나머지 삭제에는 영향을 주지 않는다.
 */
export async function runBulkDelete<T extends BulkDeletable>(
  entities: T[],
  checkReferences: (entity: T) => Promise<ReferenceCheckResult>,
  deleteOne: (entity: T) => Promise<void>,
): Promise<BulkDeleteOutcome> {
  const deleted: BulkDeleteOutcome["deleted"] = []
  const blocked: BulkDeleteOutcome["blocked"] = []
  const failed: BulkDeleteOutcome["failed"] = []

  for (const entity of entities) {
    const { canDelete, reasons } = await checkReferences(entity)
    if (!canDelete) {
      blocked.push({ id: entity.id, code: entity.code, name: entity.name, reasons })
      continue
    }
    try {
      await deleteOne(entity)
      deleted.push({ id: entity.id, code: entity.code, name: entity.name })
    } catch {
      failed.push({ id: entity.id, code: entity.code, name: entity.name, error: "DELETE_FAILED" })
    }
  }

  return { deleted, blocked, failed }
}
