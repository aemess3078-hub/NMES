/**
 * 사업계획서 "기준정보관리 > 백업관리" code-path/integrity test.
 *
 * Supabase Management API live token 없이 실행되는 pure/source test다. 실제 DB나
 * Supabase backup 원본에는 접근하지 않는다.
 */
import * as fs from "fs"
import {
  normalizeExternalBackupId,
  parseBackupTimestamp,
  formatBackupDateTimeKst,
  parseSupabaseBackupsResponse,
  filterVisibleBackups,
  computeUnclassifiedBackups,
  computeMostRecentBackupAt,
  computeMostRecentBackup,
  computeMostRecentSuccessfulBackupAt,
  computeBackupSummary,
  sortBackupsByInsertedAtDesc,
  buildBackupLookup,
  serializeBackupGroupMember,
  dedupeBackupIds,
  backupStatusLabel,
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

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/[^\r\n]*/, ""))
    .join("\n")
}

function makeBackup(id: string, insertedAt: string | null = "2026-09-01T02:00:00Z", status = "COMPLETED"): SupabaseBackupItem {
  return { externalBackupId: id, status, insertedAt: parseBackupTimestamp(insertedAt), isPhysicalBackup: true }
}

// ─── T1~T4: backup id/timestamp 정규화 ──────────────────────────────────────
assertEqual(normalizeExternalBackupId({ id: 12345, inserted_at: "2026-09-01T02:00:00Z" }), "12345", "T1. id(숫자)가 있으면 문자열로 변환해 사용")
assertEqual(normalizeExternalBackupId({ id: "abc-1", inserted_at: "2026-09-01T02:00:00Z" }), "abc-1", "T1. id(문자열)가 있으면 그대로 사용")
assertEqual(normalizeExternalBackupId({ inserted_at: "2026-09-01T02:00:00Z" }), "2026-09-01T02:00:00Z", "T2. id가 없으면 inserted_at을 식별자로 사용")
assertEqual(normalizeExternalBackupId({}), null, "T3. id와 inserted_at이 모두 없으면 식별 불가(null)")
assertEqual(parseBackupTimestamp("invalid-date"), null, "T4. invalid inserted_at은 null로 처리하고 가짜 timestamp를 만들지 않음")
assertEqual(parseBackupTimestamp("2026-09-30T06:30:00Z"), "2026-09-30T06:30:00.000Z", "T4. valid timestamp는 normalized ISO로 정규화")
assertEqual(formatBackupDateTimeKst("2026-09-30T06:30:00Z"), "2026-09-30 15:30", "T4. Asia/Seoul 고정 KST formatter")
assertEqual(formatBackupDateTimeKst(null), "확인 불가", "T4. null timestamp는 확인 불가")

// ─── T5~T8: Supabase 응답 파싱 ──────────────────────────────────────────────
{
  const response: SupabaseBackupsApiResponse = {
    region: "ap-northeast-2",
    walg_enabled: true,
    pitr_enabled: false,
    backups: [
      { id: 1, status: "COMPLETED", inserted_at: "2026-09-04T02:00:00Z", is_physical_backup: true },
      { id: 2, status: "FAILED", inserted_at: "not-a-date", is_physical_backup: false },
    ],
  }
  const parsed = parseSupabaseBackupsResponse(response)
  assertEqual(parsed.backups.length, 2, "T5. invalid timestamp라도 id가 있으면 backup item 자체는 유지")
  assertEqual(parsed.backups[1].insertedAt, null, "T5. invalid timestamp는 insertedAt null")
  assertEqual(parsed.region, "ap-northeast-2", "T5. region 필드 파싱")
  assertTrue(parsed.walgEnabled === true && parsed.pitrEnabled === false, "T5. walg/pitr 상태를 원본 응답값 그대로 반영")
}
{
  const parsed = parseSupabaseBackupsResponse({ backups: [] })
  assertEqual(parsed.backups, [], "T6. 빈 backups 배열도 예외 없이 빈 배열로 처리")
  assertEqual(parsed.region, null, "T6. region 누락은 null")
}
{
  const parsed = parseSupabaseBackupsResponse({ backups: [{ status: "COMPLETED" }, { id: "ok-1", status: "COMPLETED" }] })
  assertEqual(parsed.backups.length, 1, "T7. id/inserted_at이 모두 없어 식별 불가능한 item만 제외")
  assertEqual(parsed.backups[0].externalBackupId, "ok-1", "T7. id가 있으면 inserted_at 없어도 포함")
}
assertEqual(backupStatusLabel("UNKNOWN_NEW_STATUS"), "UNKNOWN_NEW_STATUS", "T8. unknown status는 성공/실패로 강제 변환하지 않고 원본 문자열 표시")

// ─── T9~T12: visible/미분류/정렬 ─────────────────────────────────────────────
{
  const all = [makeBackup("b1"), makeBackup("b2"), makeBackup("b3")]
  const visible = filterVisibleBackups(all, new Set(["b2"]))
  assertEqual(visible.map((b) => b.externalBackupId), ["b1", "b3"], "T9. HiddenBackup은 visible 목록에서만 제외")
}
{
  const visible = [makeBackup("b1"), makeBackup("b2"), makeBackup("b3")]
  const unclassified = computeUnclassifiedBackups(visible, new Set(["b2"]))
  assertEqual(unclassified.map((b) => b.externalBackupId), ["b1", "b3"], "T10. 어느 그룹에도 속하지 않은 visible backup만 미분류")
}
{
  const sorted = sortBackupsByInsertedAtDesc([
    makeBackup("old", "2026-09-29T00:00:00Z"),
    makeBackup("invalid", null),
    makeBackup("new", "2026-09-30T00:00:00Z"),
  ])
  assertEqual(sorted.map((b) => b.externalBackupId), ["new", "old", "invalid"], "T11. UI용 목록은 valid insertedAt 최신순, invalid/null은 뒤쪽")
}
{
  const input = [makeBackup("old", "2026-09-29T00:00:00Z"), makeBackup("new", "2026-09-30T00:00:00Z")]
  const copy = input.map((b) => b.externalBackupId)
  sortBackupsByInsertedAtDesc(input)
  assertEqual(input.map((b) => b.externalBackupId), copy, "T12. sortBackupsByInsertedAtDesc는 원본 array를 mutation하지 않음")
}

// ─── T13~T17: 운영 summary 정책 ─────────────────────────────────────────────
assertEqual(computeMostRecentBackupAt([]), null, "T13. 빈 목록이면 latest null")
assertEqual(
  computeMostRecentBackupAt([makeBackup("b1", "2026-09-01T02:00:00Z"), makeBackup("b2", "2026-09-04T02:00:00Z")]),
  "2026-09-04T02:00:00.000Z",
  "T13. 가장 최근 valid insertedAt 반환"
)
{
  const backups = [makeBackup("b-930", "2026-09-30T00:00:00Z"), makeBackup("b-929", "2026-09-29T00:00:00Z")]
  const summary = computeBackupSummary({ backups, hiddenIds: new Set(["b-930"]), region: "ap-northeast-2", walgEnabled: true, pitrEnabled: false })
  assertEqual(summary.totalBackups, 2, "T14. hidden과 무관하게 실제 DB 백업 수는 전체 Supabase 목록 기준")
  assertEqual(summary.visibleBackups, 1, "T14. 표시 백업 수만 hidden 적용")
  assertEqual(summary.hiddenBackups, 1, "T14. 숨김 백업 수는 현재 목록과 HiddenBackup 교집합")
  assertEqual(summary.mostRecentBackupAt, "2026-09-30T00:00:00.000Z", "T14. 최근 백업 시도는 hidden 영향 없음")
  assertEqual(summary.mostRecentSuccessfulBackupAt, "2026-09-30T00:00:00.000Z", "T14. 최근 성공 백업도 hidden 영향 없음")
}
{
  const backups = [makeBackup("failed", "2026-09-30T00:00:00Z", "FAILED"), makeBackup("ok", "2026-09-29T00:00:00Z", "COMPLETED")]
  const latest = computeMostRecentBackup(backups)
  const summary = computeBackupSummary({ backups, hiddenIds: new Set(), region: null, walgEnabled: null, pitrEnabled: null })
  assertEqual(latest?.status, "FAILED", "T15. latest attempt는 실패 상태도 그대로 표현")
  assertEqual(summary.mostRecentSuccessfulBackupAt, "2026-09-29T00:00:00.000Z", "T15. latest success는 COMPLETED만 기준")
  assertEqual(summary.failedBackups, 1, "T15. 실패 건수는 FAILED count")
}
{
  const backups = [makeBackup("unknown", "2026-09-30T00:00:00Z", "UNKNOWN"), makeBackup("ok", "2026-09-29T00:00:00Z", "COMPLETED")]
  assertEqual(computeMostRecentSuccessfulBackupAt(backups), "2026-09-29T00:00:00.000Z", "T16. UNKNOWN status는 성공 백업에 포함하지 않음")
}
{
  const summary = computeBackupSummary({ backups: [makeBackup("b1")], hiddenIds: new Set(["stale-hidden"]), region: null, walgEnabled: null, pitrEnabled: null })
  assertEqual(summary.hiddenBackups, 0, "T17. 현재 Supabase 목록에 없는 stale HiddenBackup metadata는 상단 숨김 백업 수에서 제외")
}

// ─── T18~T20: 그룹 멤버/입력 정리 ───────────────────────────────────────────
{
  const lookup = buildBackupLookup([makeBackup("b1")])
  const known = serializeBackupGroupMember("b1", lookup, new Set())
  assertTrue(known.status === "COMPLETED" && known.insertedAt !== null, "T18. 원본 목록에 있는 backup은 상태/일시가 채워짐")
  const unknown = serializeBackupGroupMember("b-deleted", lookup, new Set())
  assertTrue(unknown.status === null && unknown.insertedAt === null && unknown.isPhysicalBackup === null, "T18. 원본 목록에서 사라진 externalBackupId도 graceful 처리")
  const hidden = serializeBackupGroupMember("b1", lookup, new Set(["b1"]))
  assertTrue(hidden.hidden === true, "T18. 숨김 처리된 group member는 hidden=true")
}
assertEqual(dedupeBackupIds(["b1", "b2", "b1", " ", "", "b3"]), ["b1", "b2", "b3"], "T19. 중복/빈 externalBackupIds 제거")
assertEqual(dedupeBackupIds([]), [], "T20. 빈 배열 입력도 예외 없이 처리")

// ─── T21~T44: source-check ──────────────────────────────────────────────────
const actionsSource = fs.readFileSync("src/lib/actions/backup.actions.ts", "utf8")
const helpersSource = fs.readFileSync("src/lib/actions/backup.helpers.ts", "utf8")
const managementSource = fs.readFileSync("src/lib/supabase-management/backups.ts", "utf8")
const clientSource = fs.readFileSync("src/app/app/mes/backups/backup-management-client.tsx", "utf8")
const detailSource = fs.readFileSync("src/app/app/mes/backups/backup-group-detail-sheet.tsx", "utf8")
const formSource = fs.readFileSync("src/app/app/mes/backups/backup-group-form-sheet.tsx", "utf8")
const pageSource = fs.readFileSync("src/app/app/mes/backups/page.tsx", "utf8")
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"))

{
  const viewerGates = (actionsSource.match(/await requireRole\("VIEWER"\)/g) || []).length
  const operatorGates = (actionsSource.match(/await requireRole\("OPERATOR"\)/g) || []).length
  assertTrue(viewerGates === 2 && operatorGates === 5, "T21. 조회 2개는 VIEWER, mutation 5개(create/update/delete/hide/unhide)는 OPERATOR 권한 게이트")
}
{
  assertTrue(/prisma\.backupGroup\.findFirst\(\{\s*where:\s*\{\s*id,\s*tenantId\s*\}/.test(actionsSource), "T22. BackupGroup ownership check에 tenantId 포함")
  assertTrue(/tx\.backupGroupItem\.deleteMany\(\{\s*where:\s*\{\s*groupId:\s*id,\s*tenantId\s*\}\s*\}\)/.test(actionsSource), "T22. BackupGroupItem deleteMany에 tenantId 방어 조건 포함")
  assertTrue(/tx\.hiddenBackup\.deleteMany\(\{\s*where:\s*\{\s*id:\s*existing\.id,\s*tenantId\s*\}\s*\}\)/.test(actionsSource), "T22. unhide는 현재 tenant HiddenBackup metadata만 삭제")
}
{
  const createStart = actionsSource.indexOf("export async function createBackupGroup")
  const createBody = actionsSource.slice(createStart, actionsSource.indexOf("\n// ─── 그룹 수정", createStart))
  assertTrue(/await validateCurrentBackupIds\(ids,/.test(createBody), "T23. createBackupGroup은 서버에서 현재 Supabase backup ID 존재를 검증")
  assertTrue(/tx\.backupGroup\.create\(/.test(createBody) && /tx\.backupGroupItem\.createMany\(/.test(createBody) && /action:\s*"CREATE"/.test(createBody), "T23. createBackupGroup은 그룹/멤버 생성과 AuditLog CREATE 기록")
}
{
  const updateStart = actionsSource.indexOf("export async function updateBackupGroup")
  const updateBody = actionsSource.slice(updateStart, actionsSource.indexOf("\n// ─── 그룹 삭제", updateStart))
  assertTrue(/newlyAddedIds/.test(updateBody) && /await validateCurrentBackupIds\(newlyAddedIds,/.test(updateBody), "T24. updateBackupGroup은 newlyAddedIds만 현재 backup 목록 존재 여부를 검증")
  assertTrue(/existingIds/.test(updateBody), "T24. 기존 stale member는 새로 추가된 ID로 취급하지 않아 보존 가능")
  assertTrue(/action:\s*"UPDATE"/.test(updateBody), "T24. updateBackupGroup은 AuditLog UPDATE 기록")
}
{
  const hideStart = actionsSource.indexOf("export async function hideBackup")
  const hideBody = actionsSource.slice(hideStart, actionsSource.indexOf("export async function unhideBackup", hideStart))
  assertTrue(/prisma\.hiddenBackup\.findFirst\(\{\s*where:\s*\{\s*tenantId,\s*externalBackupId:\s*id\s*\}\s*\}\)/.test(hideBody), "T25. hideBackup은 tenantId 기준 existing HiddenBackup 확인")
  assertTrue(/await validateCurrentBackupIds\(\[id\],/.test(hideBody), "T25. hideBackup direct-call arbitrary ID는 현재 Supabase 목록 검증 후에만 생성")
  assertTrue(/tx\.hiddenBackup\.create\(/.test(hideBody) && /entityType:\s*"HiddenBackup"/.test(hideBody) && /action:\s*"CREATE"/.test(hideBody), "T25. hideBackup은 HiddenBackup CREATE + AuditLog CREATE")
}
{
  const unhideStart = actionsSource.indexOf("export async function unhideBackup")
  const unhideBody = actionsSource.slice(unhideStart)
  assertTrue(!/fetchSupabaseBackupsRaw/.test(unhideBody), "T26. unhideBackup은 Supabase API 조회 없이 stale hidden metadata도 해제 가능")
  assertTrue(/tx\.hiddenBackup\.deleteMany/.test(unhideBody) && /action:\s*"DELETE"/.test(unhideBody), "T26. unhideBackup은 HiddenBackup DELETE + AuditLog DELETE")
}
{
  const managementCode = stripComments(managementSource)
  const actionsCode = stripComments(actionsSource)
  const fetchCallCount = (managementCode.match(/await fetch\(/g) || []).length
  const onlyGetMethod = !/method:\s*"(POST|PATCH|DELETE|PUT)"/.test(managementCode)
  const noRestoreMention = !/restore/i.test(managementCode) && !/restore/i.test(actionsCode)
  const noDeleteBackupEndpoint = !/database\/backups\/[^"'`\s)]+["'`]/.test(managementCode)
  assertTrue(fetchCallCount === 1 && onlyGetMethod && noRestoreMention && noDeleteBackupEndpoint, "T27. Supabase Management API executable code는 GET 백업 목록 조회 1개뿐이며 restore/PITR/backup mutation 없음")
}
{
  assertTrue(/KNOWN_CNS_SUPABASE_REF\s*=\s*"rkglajpajtuavmptidur"/.test(managementSource), "T28. known CNS project ref fail-safe 상수 존재")
  assertTrue(/if \(ref === KNOWN_CNS_SUPABASE_REF\)[\s\S]*return null[\s\S]*await fetch/.test(managementSource), "T28. CNS ref면 fetch 실행 전 null 반환")
}
{
  assertTrue(/checkedAt:\s*string/.test(actionsSource) && /const checkedAt = new Date\(\)\.toISOString\(\)/.test(actionsSource), "T29. checkedAt은 runtime ISO field이며 DB field가 아님")
  assertTrue(!/checkedAt/.test(fs.readFileSync("prisma/schema.prisma", "utf8")), "T29. checkedAt schema field 없음")
}
{
  assertTrue(/totalBackups/.test(helpersSource) && /visibleBackups/.test(helpersSource) && /hiddenBackups/.test(helpersSource), "T30. BackupSummary가 실제/표시/숨김 count를 분리")
  assertTrue(/mostRecentBackupStatus/.test(helpersSource) && /mostRecentSuccessfulBackupAt/.test(helpersSource) && /failedBackups/.test(helpersSource), "T30. latest attempt/status/latest success/failed count를 분리")
  assertTrue(/params\.backups/.test(helpersSource) && /filterVisibleBackups\(params\.backups/.test(helpersSource), "T30. 운영 summary는 전체 backups 기준이며 visible만 hidden 적용")
}
{
  const uiSources = clientSource + pageSource + formSource + detailSource
  for (const forbidden of ["Supabase", "metadata", "PITR", "WAL-G", "DB Region", "백업 서버 위치", "복구 준비 상태", "시점 복구", "백업 로그 보관", "자동백업 상태"]) {
    assertTrue(!uiSources.includes(forbidden), `T31. backup UI에 기술 용어 노출 금지: ${forbidden}`)
  }
  for (const required of ["시스템 백업", "전체 백업", "최근 백업", "최근 정상 백업", "백업 오류", "마지막 확인", "백업 분류", "분류되지 않은 백업", "목록에서 숨기기", "실제 백업은 삭제되지 않습니다."]) {
    assertTrue(uiSources.includes(required), `T31. backup UI 사용자 친화 문구 존재: ${required}`)
  }
}
{
  assertTrue(pageSource.includes("MES 시스템 백업 상태") && pageSource.includes("필요한 백업은 분류하거나 목록에서 숨길 수 있습니다."), "T32. 페이지 설명이 시스템 백업 조회 + 화면 분류 기능임을 명시")
  assertTrue(clientSource.includes("생산·품질 문서의 첨부파일 관리와는 별도 기능입니다."), "T32. 첨부파일 관리는 별도 기능임을 짧게 명시")
}
{
  assertTrue(clientSource.includes("백업 상태를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요. 백업 분류와 숨김 설정은 그대로 유지됩니다."), "T33. 조회 실패 안내는 백업 없음으로 오해되지 않게 표시")
}
{
  const backupActionSources = clientSource + detailSource
  assertTrue(!backupActionSources.includes("목록에서 삭제"), "T34. backup action confirm에서 목록 삭제 표현 제거")
  assertTrue(!/title="삭제"/.test(backupActionSources), "T34. backup row action title=삭제 제거")
  assertTrue(backupActionSources.includes("목록에서 숨기기") && backupActionSources.includes("실제 백업은 삭제되지 않습니다."), "T34. 숨김 UX와 실제 백업 불변 문구 존재")
  assertTrue(detailSource.includes("분류만 삭제되며 실제 백업은 삭제되지 않습니다."), "T34. 백업 분류 삭제 confirm도 실제 backup 불변 명시")
}
{
  assertTrue(clientSource.includes("숨김 백업") && clientSource.includes("다시 표시") && clientSource.includes("현재 목록에 없음"), "T35. 숨김 백업 section과 unhide UI, stale metadata 표시 존재")
  assertTrue(clientSource.includes("현재 백업 정보를 확인할 수 없습니다."), "T35. API unavailable에서도 현재 백업 정보 불가와 화면 설정 표시를 분리")
}
{
  assertTrue(formSource.includes("백업 분류는 화면에서 백업을 보기 좋게 묶기 위한 항목") && formSource.includes("실제 백업은 변경되지"), "T36. 백업 분류 FormSheet 설명이 화면 분류용임을 제조 현장 용어로 명시")
}
{
  assertTrue(helpersSource.includes("timeZone: \"Asia/Seoul\"") && !clientSource.includes("getHours()") && !detailSource.includes("getHours()") && !formSource.includes("getHours()"), "T37. backup 화면은 browser local timezone 대신 Asia/Seoul formatter 사용")
}
{
  assertTrue(/sortBackupsByInsertedAtDesc/.test(helpersSource), "T38. explicit backup sorting helper 존재")
  assertTrue((actionsSource.match(/sortBackupsByInsertedAtDesc/g) || []).length >= 4, "T38. visible/unclassified/hidden/detail 목록에 명시적 정렬 적용")
  assertTrue(formSource.includes("sortBackupsByInsertedAtDesc"), "T38. group picker current backup 목록도 helper로 정렬")
}
{
  assertTrue(!clientSource.includes("SUPABASE_MANAGEMENT_ACCESS_TOKEN") && !detailSource.includes("SUPABASE_MANAGEMENT_ACCESS_TOKEN") && !formSource.includes("SUPABASE_MANAGEMENT_ACCESS_TOKEN"), "T39. Management token 이름/값을 client component에 노출하지 않음")
}
{
  const hasMigration = fs.existsSync("prisma/migrations/20260904040000_add_backup_management_groups/migration.sql")
  const migrationSql = hasMigration ? fs.readFileSync("prisma/migrations/20260904040000_add_backup_management_groups/migration.sql", "utf8") : ""
  assertTrue(hasMigration && /CREATE TABLE "BackupGroup"/.test(migrationSql) && /CREATE TABLE "HiddenBackup"/.test(migrationSql), "T40. 기존 BackupGroup/HiddenBackup migration은 존재")
  assertTrue(!fs.existsSync("prisma/migrations/20260930000000_f26_backup_operational_visibility"), "T40. F26 신규 migration 디렉터리 없음")
}
{
  assertTrue(packageJson.scripts["test:f26-backup-operational-visibility"] === packageJson.scripts["test:backup-management"], "T41. test:f26-backup-operational-visibility alias가 기존 backup test를 실행")
}
{
  assertTrue(clientSource.includes("조회 불가") && !clientSource.includes("0건") && !clientSource.includes("백업이 0건"), "T42. available=false 화면이 backup 0건처럼 보이지 않음")
}
{
  assertTrue(actionsSource.includes("hiddenBackups: serializeHiddenBackupRows({ hiddenRows, lookup: new Map() })"), "T43. API unavailable이어도 HiddenBackup metadata 목록을 반환")
}
{
  assertTrue(/fetchSupabaseBackupsRaw\(\)/.test(actionsSource) && /loadCurrentBackupLookup/.test(actionsSource) && /validateCurrentBackupIds/.test(actionsSource), "T44. 서버 action은 client 전달 ID를 신뢰하지 않고 current backup lookup helper를 사용")
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
