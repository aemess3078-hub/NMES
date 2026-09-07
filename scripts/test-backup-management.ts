/**
 * 사업계획서 "기준정보관리 > 백업관리" code-path test.
 *
 * backup.helpers.ts는 DB/Supabase Management API에 의존하지 않는 순수 함수라
 * fabricated response로 직접 검증한다(defect-corrective-action.helpers.ts와
 * 동일 방식). 실제 Supabase Management API는 이 환경에 access token이 없어
 * 라이브 호출로 검증하지 못했다(§ STEP 4/32 — 최종 보고에 명시) — 대신 이
 * 테스트는 (1) 공개 API 레퍼런스 기준으로 작성한 파싱 로직이 있음직한 응답
 * 형태들(id 있음/없음, 빈 목록 등)에 대해 안전하게 동작하는지, (2) 실제 DB
 * mutation(tenant 재검증/AuditLog/삭제 순서)이 필요한 로직은 실제 배포된 소스
 * 구조를 읽어 검증한다("code-path"/"source-check" 라벨 규칙은
 * scripts/test-corrective-action.ts와 동일).
 *
 * 실행:
 *   npx ts-node --compiler-options '{"module":"commonjs"}' --project tsconfig.json scripts/test-backup-management.ts
 */
import * as fs from "fs"
import {
  normalizeExternalBackupId,
  parseSupabaseBackupsResponse,
  filterVisibleBackups,
  computeUnclassifiedBackups,
  computeMostRecentBackupAt,
  buildBackupLookup,
  serializeBackupGroupMember,
  dedupeBackupIds,
  type SupabaseBackupItem,
} from "../src/lib/actions/backup.helpers"
import type { SupabaseBackupsApiResponse } from "../src/lib/supabase-management/backups"

let passed = 0
let failed = 0

function assertEqual<T>(actual: T, expected: T, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    passed++
  } else {
    failed++
    console.error(`FAIL: ${label}`)
    console.error(`  expected: ${JSON.stringify(expected)}`)
    console.error(`  actual:   ${JSON.stringify(actual)}`)
  }
}

function assertTrue(cond: boolean, label: string) {
  if (cond) {
    passed++
  } else {
    failed++
    console.error(`FAIL: ${label}`)
  }
}

// ─── T1~T3: backup id 정규화 — id 유무와 무관하게 안전한 식별자 ─────────────
assertEqual(normalizeExternalBackupId({ id: 12345, inserted_at: "2026-09-01T02:00:00Z" }), "12345", "T1. id(숫자)가 있으면 문자열로 변환해 사용")
assertEqual(normalizeExternalBackupId({ id: "abc-1", inserted_at: "2026-09-01T02:00:00Z" }), "abc-1", "T1. id(문자열)가 있으면 그대로 사용")
assertEqual(normalizeExternalBackupId({ inserted_at: "2026-09-01T02:00:00Z" }), "2026-09-01T02:00:00Z", "T2. id가 없으면 inserted_at을 식별자로 사용(§ STEP 13 — API 응답 구조에 강하게 의존하지 않음)")
assertEqual(normalizeExternalBackupId({}), null, "T3. id와 inserted_at이 모두 없으면 식별 불가(null)")

// ─── T4~T6: Supabase 응답 파싱 — DTO/빈 목록/식별 불가 항목 스킵 ────────────
{
  const response: SupabaseBackupsApiResponse = {
    region: "ap-northeast-2",
    walg_enabled: true,
    pitr_enabled: false,
    backups: [
      { id: 1, status: "COMPLETED", inserted_at: "2026-09-04T02:00:00Z", is_physical_backup: true },
      { id: 2, status: "COMPLETED", inserted_at: "2026-09-03T02:00:00Z", is_physical_backup: false },
    ],
  }
  const parsed = parseSupabaseBackupsResponse(response)
  assertEqual(parsed.backups.length, 2, "T4. backups 배열이 정상 파싱됨")
  assertEqual(parsed.region, "ap-northeast-2", "T4. region 필드 파싱")
  assertTrue(parsed.walgEnabled === true && parsed.pitrEnabled === false, "T4. walg_enabled/pitr_enabled이 실제 API 응답값 그대로 반영(가짜 상태 생성 없음)")
}
{
  // T5: 빈 목록 — 크래시 없이 빈 배열
  const parsed = parseSupabaseBackupsResponse({ backups: [] })
  assertEqual(parsed.backups, [], "T5. 빈 backups 배열도 예외 없이 빈 배열로 처리")
  assertEqual(parsed.region, null, "T5. region 등 누락 필드는 null로 안전하게 처리")
}
{
  // T6: id/inserted_at이 모두 없는 항목은 조용히 스킵(임의 데이터 생성 안 함, § STEP 7)
  const parsed = parseSupabaseBackupsResponse({
    backups: [
      { status: "COMPLETED" }, // 식별 불가 — 스킵되어야 함
      { id: "ok-1", status: "COMPLETED", inserted_at: "2026-09-01T00:00:00Z" },
    ],
  })
  assertEqual(parsed.backups.length, 1, "T6. 식별 불가능한 backup 항목은 화면에 표시할 방법이 없으므로 조용히 제외")
  assertEqual(parsed.backups[0].externalBackupId, "ok-1", "T6. 식별 가능한 항목만 정상 포함")
}

// ─── T7~T9: visible/미분류 계산 — 숨김/그룹 소속 여부와 M:N 반영 ────────────
function makeBackup(id: string, insertedAt = "2026-09-01T02:00:00Z"): SupabaseBackupItem {
  return { externalBackupId: id, status: "COMPLETED", insertedAt, isPhysicalBackup: true }
}
{
  const all = [makeBackup("b1"), makeBackup("b2"), makeBackup("b3")]
  const visible = filterVisibleBackups(all, new Set(["b2"]))
  assertEqual(
    visible.map((b) => b.externalBackupId),
    ["b1", "b3"],
    "T7. HiddenBackup에 포함된 항목만 visible 목록에서 제외(원본 목록 자체는 변경하지 않음)"
  )
}
{
  const visible = [makeBackup("b1"), makeBackup("b2"), makeBackup("b3")]
  const unclassified = computeUnclassifiedBackups(visible, new Set(["b2"]))
  assertEqual(
    unclassified.map((b) => b.externalBackupId),
    ["b1", "b3"],
    "T8. 어느 그룹에도 속하지 않은 visible backup만 미분류로 계산"
  )
}
{
  // T9: 같은 backup이 여러 그룹에 속해도(= groupedIds에 한 번만 존재) 미분류 계산은 정상
  const visible = [makeBackup("b1")]
  const unclassified = computeUnclassifiedBackups(visible, new Set(["b1"])) // b1이 여러 그룹에 속해도 Set은 한 번만 기록됨
  assertEqual(unclassified, [], "T9. 여러 그룹에 속한 backup도 정상적으로 미분류에서 제외(M:N 관계가 Set 기반 계산에 자연히 반영됨)")
}

// ─── T10: 최근 백업일시 계산 ─────────────────────────────────────────────────
assertEqual(computeMostRecentBackupAt([]), null, "T10. 빈 목록이면 null")
assertEqual(
  computeMostRecentBackupAt([makeBackup("b1", "2026-09-01T02:00:00Z"), makeBackup("b2", "2026-09-04T02:00:00Z"), makeBackup("b3", "2026-09-02T02:00:00Z")]),
  "2026-09-04T02:00:00Z",
  "T10. 가장 최근 insertedAt을 반환"
)

// ─── T11: 그룹 멤버 직렬화 — 원본 목록에서 사라진(알 수 없는) backup도 graceful 처리 ─
{
  const lookup = buildBackupLookup([makeBackup("b1")])
  const known = serializeBackupGroupMember("b1", lookup, new Set())
  assertTrue(known.status === "COMPLETED" && known.insertedAt !== null, "T11. 원본 목록에 있는 backup은 상태/일시가 정상 채워짐")

  const unknown = serializeBackupGroupMember("b-deleted", lookup, new Set())
  assertTrue(
    unknown.status === null && unknown.insertedAt === null && unknown.isPhysicalBackup === null,
    "T11. 원본 목록에서 사라졌거나 알 수 없는 externalBackupId도 예외 없이 null 필드로 graceful 처리(§ STEP 19/30-T19)"
  )

  const hidden = serializeBackupGroupMember("b1", lookup, new Set(["b1"]))
  assertTrue(hidden.hidden === true, "T11. 숨김 처리된 backup은 hidden=true로 표시(그룹 멤버십 자체는 유지)")
}

// ─── T12~T13: externalBackupIds 정리 — 중복/빈 값 제거 ──────────────────────
assertEqual(dedupeBackupIds(["b1", "b2", "b1", " ", "", "b3"]), ["b1", "b2", "b3"], "T12. 동일 그룹 내 중복 backup ID와 빈 값을 제거")
assertEqual(dedupeBackupIds([]), [], "T13. 빈 배열 입력도 예외 없이 빈 배열 반환")

// ─── T14~T22: source-check — 실제 배포 소스 구조 검증 ────────────────────────
const actionsSource = fs.readFileSync("src/lib/actions/backup.actions.ts", "utf8")
const managementSource = fs.readFileSync("src/lib/supabase-management/backups.ts", "utf8")

// T14: 조회는 VIEWER, mutation은 OPERATOR 권한 게이트
{
  const viewerGates = (actionsSource.match(/await requireRole\("VIEWER"\)/g) || []).length
  const operatorGates = (actionsSource.match(/await requireRole\("OPERATOR"\)/g) || []).length
  assertTrue(
    viewerGates === 2 && operatorGates === 4,
    "T14. 조회 함수 2개(getBackupManagementData/getBackupGroupDetail)는 VIEWER, mutation 함수 4개(create/update/delete/hide)는 OPERATOR 권한 게이트 — VIEWER는 mutation 불가"
  )
}

// T15~T16: cross-tenant 차단 — 그룹/숨김 조회·수정·삭제 모두 tenantId 조건 포함
{
  const groupFindHasTenant = /prisma\.backupGroup\.findFirst\(\{\s*where:\s*\{\s*id,\s*tenantId\s*\}\s*\}\)/.test(actionsSource)
  const groupDeleteHasTenant = /tx\.backupGroup\.deleteMany\(\{\s*where:\s*\{\s*id,\s*tenantId\s*\}\s*\}\)/.test(actionsSource)
  assertTrue(groupFindHasTenant && groupDeleteHasTenant, "T15. 그룹 조회/수정 전 소유권 확인과 삭제 시 모두 {id, tenantId} 조건으로 cross-tenant 그룹 접근을 차단")
}
{
  const hiddenHasTenant = /prisma\.hiddenBackup\.findFirst\(\{\s*where:\s*\{\s*tenantId,\s*externalBackupId:\s*id\s*\}\s*\}\)/.test(actionsSource)
  assertTrue(hiddenHasTenant, "T16. HiddenBackup 생성 전 확인도 tenantId 조건을 포함해 다른 tenant의 숨김 metadata에 영향을 주지 않음")
}

// T17: 그룹 생성 — 트랜잭션 내 create + createMany + AuditLog CREATE
{
  const fnStart = actionsSource.indexOf("export async function createBackupGroup")
  const fnBody = actionsSource.slice(fnStart, actionsSource.indexOf("\n// ─── 그룹 수정", fnStart))
  const hasCreate = /tx\.backupGroup\.create\(/.test(fnBody)
  const hasCreateMany = /tx\.backupGroupItem\.createMany\(/.test(fnBody)
  const hasAudit = /action:\s*"CREATE"/.test(fnBody)
  const usesDedupe = /dedupeBackupIds\(data\.externalBackupIds\)/.test(fnBody)
  assertTrue(hasCreate && hasCreateMany && hasAudit && usesDedupe, "T17. createBackupGroup이 그룹 생성 + 멤버 일괄 생성을 한 트랜잭션에서 처리하고 AuditLog CREATE를 기록, 중복 backup ID는 dedupeBackupIds로 제거")
}

// T18: 그룹 수정 — 멤버십 전체 교체(delete + createMany) 방식, AuditLog UPDATE
{
  const fnStart = actionsSource.indexOf("export async function updateBackupGroup")
  const fnBody = actionsSource.slice(fnStart, actionsSource.indexOf("\n// ─── 그룹 삭제", fnStart))
  const deletesOld = /tx\.backupGroupItem\.deleteMany\(\{\s*where:\s*\{\s*groupId:\s*id\s*\}\s*\}\)/.test(fnBody)
  const createsNew = /tx\.backupGroupItem\.createMany\(/.test(fnBody)
  const hasAudit = /action:\s*"UPDATE"/.test(fnBody)
  assertTrue(deletesOld && createsNew && hasAudit, "T18. updateBackupGroup이 기존 멤버십을 전체 삭제 후 재생성하는 방식으로 backup 추가/제거를 처리하고 AuditLog UPDATE를 기록")
}

// T19: 그룹 삭제 — deleteMany(cascade로 BackupGroupItem 함께 삭제) + AuditLog DELETE, Supabase backup 원본 API 호출 없음
{
  const fnStart = actionsSource.indexOf("export async function deleteBackupGroup")
  const fnBody = actionsSource.slice(fnStart, actionsSource.indexOf("\n// ─── 백업 목록 삭제", fnStart))
  const hasDelete = /tx\.backupGroup\.deleteMany\(/.test(fnBody)
  const hasAudit = /action:\s*"DELETE"/.test(fnBody)
  const noBackupItemDeleteCall = !/tx\.backupGroupItem\.deleteMany/.test(fnBody) // cascade에 위임, 명시적 삭제 호출 없음
  assertTrue(hasDelete && hasAudit && noBackupItemDeleteCall, "T19. deleteBackupGroup이 그룹만 삭제하고 BackupGroupItem은 FK cascade에 위임(명시적 삭제 호출 없음), AuditLog DELETE 기록")
}

// T20: 백업 목록 삭제(hide) — idempotent, AuditLog CREATE(HiddenBackup)
{
  const fnStart = actionsSource.indexOf("export async function hideBackup")
  const fnBody = actionsSource.slice(fnStart)
  const checksExisting = /prisma\.hiddenBackup\.findFirst\(/.test(fnBody)
  const createsOnlyIfMissing = /if\s*\(!existing\)\s*\{/.test(fnBody)
  const hasAudit = /entityType:\s*"HiddenBackup"/.test(fnBody) && /action:\s*"CREATE"/.test(fnBody)
  assertTrue(checksExisting && createsOnlyIfMissing && hasAudit, "T20. hideBackup이 이미 숨겨진 backup에 대해 idempotent(중복 AuditLog 없음)하게 동작하고, 신규 숨김만 AuditLog CREATE 기록")
}

// T21: 실제 Supabase backup 원본 보호 — mutation(delete/restore/PITR) 엔드포인트를 전혀 호출하지 않음
// (금지 사실을 설명하는 주석 자체에는 "restore"/"PITR" 같은 단어가 당연히 등장하므로,
// 주석을 제거한 코드 본문만 검사해야 오탐이 없다.)
function stripComments(src: string): string {
  // Windows(core.autocrlf)에서 체크아웃하면 줄 끝에 \r이 남는데, `.*$`는 `.`가
  // 줄바꿈 문자(\r 포함)를 매칭하지 않아 그 \r 때문에 `$`(문자열 끝)에 도달하지
  // 못해 매치 자체가 실패한다(주석이 전혀 안 지워짐) — `$` 앵커 대신 [^\r\n]*로
  // "다음 줄바꿈 문자 전까지"를 매칭해 CRLF/LF 어느 쪽이든 안전하게 동작시킨다.
  return src
    .split("\n")
    .map((line) => line.replace(/\/\/[^\r\n]*/, ""))
    .join("\n")
}
{
  const managementCode = stripComments(managementSource)
  const actionsCode = stripComments(actionsSource)
  const fetchCallCount = (managementCode.match(/await fetch\(/g) || []).length
  const onlyGetMethod = !/method:\s*"(POST|PATCH|DELETE|PUT)"/.test(managementCode)
  // "pitr_enabled"는 Supabase API가 실제로 제공하는 읽기 전용 상태 필드명이라 정상 허용 대상이다
  // (§ STEP 4) — "restore"라는 동작 자체만 코드 본문에 없는지 확인한다.
  const noRestoreMention = !/restore/i.test(managementCode) && !/restore/i.test(actionsCode)
  const noDeleteBackupEndpoint = !/database\/backups\/[^"'`\s)]+["'`]/.test(managementCode) // 개별 backup 삭제용 하위 경로 미사용
  assertTrue(
    fetchCallCount === 1 && onlyGetMethod && noRestoreMention && noDeleteBackupEndpoint,
    "T21. Supabase Management API 호출은 GET 백업 목록 조회 1개뿐이며, restore/PITR/backup mutation 관련 코드가 전혀 없음(§ STEP 27) — 주석을 제외한 실제 코드 본문 기준"
  )
}

// T22: 신규 Prisma migration 존재 확인
{
  const hasMigration = fs.existsSync("prisma/migrations/20260904040000_add_backup_management_groups/migration.sql")
  const migrationSql = hasMigration ? fs.readFileSync("prisma/migrations/20260904040000_add_backup_management_groups/migration.sql", "utf8") : ""
  const hasGroupTable = /CREATE TABLE "BackupGroup"/.test(migrationSql)
  const hasItemUnique = /CREATE UNIQUE INDEX "BackupGroupItem_groupId_externalBackupId_key"/.test(migrationSql)
  const hasHiddenUnique = /CREATE UNIQUE INDEX "HiddenBackup_tenantId_externalBackupId_key"/.test(migrationSql)
  const hasCascade = /ADD CONSTRAINT "BackupGroupItem_groupId_fkey" FOREIGN KEY \("groupId"\) REFERENCES "BackupGroup"\("id"\) ON DELETE CASCADE/.test(migrationSql)
  assertTrue(
    hasMigration && hasGroupTable && hasItemUnique && hasHiddenUnique && hasCascade,
    "T22. migration에 BackupGroup/BackupGroupItem/HiddenBackup 테이블, (groupId,externalBackupId) unique(동일 그룹 내 중복 방지), (tenantId,externalBackupId) unique, 그룹 삭제 시 GroupItem cascade가 모두 존재"
  )
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
