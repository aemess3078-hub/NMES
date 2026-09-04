/**
 * 사업계획서 "첨부파일관리" code-path test.
 *
 * attachment.helpers.ts는 DB/Storage에 의존하지 않는 순수 함수라 직접 검증한다
 * (defect-corrective-action.helpers.ts와 동일 방식). tenant 재검증/entity 소유권
 * 확인/Storage REST 호출/보상삭제처럼 실제 네트워크·DB 호출이 필수인 로직은,
 * 실제 배포된 소스 파일 텍스트를 읽어 정확한 패턴이 존재하는지 구조적으로
 * 검증한다("code-path"/"source-check" 라벨 규칙은 scripts/test-corrective-action.ts와
 * 동일). Storage API 자체는 unit test에서 실제로 호출하지 않고(네트워크/자격증명
 * 필요), 대신 서버 인가/검증 로직과 브라우저 스모크로 실제 업로드/다운로드/삭제를
 * 확인한다(§ STEP 25).
 *
 * 실행:
 *   npx ts-node --compiler-options '{"module":"commonjs"}' --project tsconfig.json scripts/test-attachment-management.ts
 */
import * as fs from "fs"
import {
  ATTACHMENT_ENTITY_TYPES,
  ATTACHMENT_ENTITY_TYPE_LABEL,
  ALLOWED_ATTACHMENT_EXTENSIONS,
  MAX_ATTACHMENT_FILE_SIZE_BYTES,
  isValidAttachmentEntityType,
  getFileExtension,
  validateAttachmentFile,
  sanitizeFileName,
  buildAttachmentStoragePath,
  formatFileSize,
  serializeAttachmentRow,
  type AttachmentRecordLike,
} from "../src/lib/actions/attachment.helpers"

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

function assertThrows(fn: () => void, label: string) {
  try {
    fn()
    failed++
    console.error(`FAIL: ${label} (에러가 발생하지 않음)`)
  } catch {
    passed++
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

// ─── T1~T2: entityType allow-list ────────────────────────────────────────────
assertTrue(isValidAttachmentEntityType("DEFECT_CORRECTIVE_ACTION"), "T1. 조치관리 entityType 허용")
assertTrue(isValidAttachmentEntityType("DEFECT_RECURRENCE_PREVENTION"), "T1. 재발방지관리 entityType 허용")
assertTrue(!isValidAttachmentEntityType("RANDOM_TYPE"), "T2. allow-list에 없는 임의 문자열은 차단(무제한 polymorphic 아님)")
assertTrue(!isValidAttachmentEntityType(""), "T2. 빈 문자열도 차단")
assertEqual(ATTACHMENT_ENTITY_TYPE_LABEL.DEFECT_CORRECTIVE_ACTION, "조치관리", "T2. 업무구분 표시 라벨 매핑")

// ─── T3~T6: 파일 검증 — 확장자/크기/빈 파일 ───────────────────────────────────
assertEqual(getFileExtension("report.pdf"), "pdf", "T3. 확장자 추출(소문자 정규화)")
assertEqual(getFileExtension("REPORT.PDF"), "pdf", "T3. 확장자 대소문자 무시")
assertEqual(getFileExtension("noext"), "", "T3. 확장자 없는 파일명은 빈 문자열")

for (const ext of ALLOWED_ATTACHMENT_EXTENSIONS) {
  try {
    validateAttachmentFile(`file.${ext}`, 1024)
    passed++
  } catch {
    failed++
    console.error(`FAIL: T4. 허용 확장자(${ext})는 통과해야 함`)
  }
}
assertThrows(() => validateAttachmentFile("virus.exe", 1024), "T5. exe 확장자 차단")
assertThrows(() => validateAttachmentFile("script.js", 1024), "T5. js 확장자 차단")
assertThrows(() => validateAttachmentFile("archive.zip", 1024), "T5. zip은 실제 필요성 확인 전까지 허용하지 않음(§ STEP 7)")
assertThrows(() => validateAttachmentFile("noext", 1024), "T5. 확장자 없는 파일 차단")
assertThrows(() => validateAttachmentFile("empty.pdf", 0), "T6. 빈 파일(size=0) 차단")
assertThrows(() => validateAttachmentFile("huge.pdf", MAX_ATTACHMENT_FILE_SIZE_BYTES + 1), "T6. 최대 크기(20MB) 초과 차단")
assertTrue(
  (() => {
    try {
      validateAttachmentFile("ok.pdf", MAX_ATTACHMENT_FILE_SIZE_BYTES)
      return true
    } catch {
      return false
    }
  })(),
  "T6. 정확히 최대 크기(20MB)는 통과(경계값)"
)

// ─── T7~T8: 파일명 sanitize ───────────────────────────────────────────────────
assertEqual(sanitizeFileName("../../etc/passwd"), "passwd", "T7. 경로 순회 문자열은 마지막 세그먼트만 남기고 상위 경로 제거")
assertEqual(sanitizeFileName("my report (final).pdf"), "my_report_final.pdf", "T7. 공백은 밑줄로, 허용되지 않는 특수문자(괄호 등)는 제거")
// Supabase Storage는 object key에 비-ASCII 문자를 허용하지 않는다(실측: 한글 포함 키 업로드 시 400 InvalidKey)
// — storagePath 구성용 sanitize에서는 한글을 제거한다. 원본 파일명(한글 포함)은 이 함수를 거치지 않고
// Attachment.fileName 컬럼에 그대로 저장되어 화면에는 원본 그대로 표시된다(§ T-route 아래 source-check).
assertEqual(sanitizeFileName("불량사진_2026.jpg"), "_2026.jpg", "T7. storagePath는 Storage 제약상 비-ASCII(한글 등)를 제거— 원본 표시명은 별도 컬럼에 그대로 보존")
assertEqual(sanitizeFileName("   "), "file", "T8. 공백만 있는 파일명은 기본값 'file'로 대체")
assertEqual(sanitizeFileName(""), "file", "T8. 빈 파일명도 기본값 'file'로 대체")

// ─── T9: storagePath 구성 — tenantId/entityType/entityId/uuid-파일명 ─────────
{
  const path = buildAttachmentStoragePath("tenant-1", "DEFECT_CORRECTIVE_ACTION", "ca-1", "report.pdf", "uuid-1234")
  assertEqual(path, "tenant-1/DEFECT_CORRECTIVE_ACTION/ca-1/uuid-1234-report.pdf", "T9. storagePath가 tenantId/entityType/entityId/uuid-파일명 형태로 구성됨(§ STEP 6)")
}

// ─── T10: 파일크기 표시 — 업무 숫자 formatter와 분리된 전용 helper ───────────
assertEqual(formatFileSize(500), "500 B", "T10. 1KB 미만은 B 단위")
assertEqual(formatFileSize(1024), "1.0 KB", "T10. 1024바이트 = 1.0 KB")
assertEqual(formatFileSize(254 * 1024), "254 KB", "T10. KB 단위(10 이상은 소수점 없이)")
assertEqual(formatFileSize(1.4 * 1024 * 1024), "1.4 MB", "T10. MB 단위 표시(예시: 1.4 MB)")
assertEqual(formatFileSize(12.8 * 1024 * 1024), "12.8 MB", "T10. MB 단위 표시(예시: 12.8 MB)")

// ─── T11~T13: 직렬화 — 연결대상 라벨 병합 ────────────────────────────────────
function makeRecord(overrides: Partial<AttachmentRecordLike> & { id: string }): AttachmentRecordLike {
  return {
    id: overrides.id,
    entityType: overrides.entityType ?? "DEFECT_CORRECTIVE_ACTION",
    entityId: overrides.entityId ?? "ca-1",
    fileName: overrides.fileName ?? "report.pdf",
    mimeType: overrides.mimeType ?? "application/pdf",
    fileSize: overrides.fileSize ?? 1024,
    description: overrides.description === undefined ? null : overrides.description,
    uploadedById: overrides.uploadedById ?? "profile-1",
    uploadedBy: overrides.uploadedBy ?? { name: "생산관리자" },
    createdAt: overrides.createdAt ?? new Date("2026-09-04T00:00:00.000Z"),
  }
}
{
  const labelMap = new Map([["ca-1", "[WO-2026-021] 구동 모듈 완제품 A형"]])
  const row = serializeAttachmentRow(makeRecord({ id: "att-1" }), labelMap)
  assertEqual(row.entityLabel, "[WO-2026-021] 구동 모듈 완제품 A형", "T11. 매핑된 연결대상 라벨이 그대로 반영됨")
  assertEqual(row.entityTypeLabel, "조치관리", "T11. entityType → 업무구분 한글 라벨 변환")
}
{
  const row = serializeAttachmentRow(makeRecord({ id: "att-2", entityId: "ca-missing" }), new Map())
  assertEqual(row.entityLabel, "(연결대상 없음)", "T12. 매핑에 없는 entityId는 '(연결대상 없음)'로 방어적 처리")
}
{
  const row = serializeAttachmentRow(makeRecord({ id: "att-3", description: "현장 사진" }), new Map())
  assertEqual(row.description, "현장 사진", "T13. 비고(description)가 그대로 직렬화됨")
  const row2 = serializeAttachmentRow(makeRecord({ id: "att-4", description: null }), new Map())
  assertEqual(row2.description, null, "T13. 비고 없으면 null 유지")
}

// ─── T14~T22: source-check — 실제 배포 소스 구조 검증 ────────────────────────
const actionsSource = fs.readFileSync("src/lib/actions/attachment.actions.ts", "utf8")
const routeSource = fs.readFileSync("src/app/api/upload/attachment/route.ts", "utf8")
const storageSource = fs.readFileSync("src/lib/storage/attachment-storage.ts", "utf8")

// T14: cross-tenant 조회 차단 — 목록/다운로드/삭제 모두 tenantId 조건 포함
{
  const listHasTenant = /prisma\.attachment\.findMany\(\{\s*where:\s*\{\s*tenantId,/.test(actionsSource)
  const downloadHasTenant = /prisma\.attachment\.findFirst\(\{\s*where:\s*\{\s*id,\s*tenantId\s*\}\s*\}\)/.test(actionsSource)
  assertTrue(listHasTenant && downloadHasTenant, "T14. 목록 조회/다운로드 URL 발급 모두 tenantId 조건이 where절에 포함되어 cross-tenant 조회를 차단")
}

// T15: cross-tenant 삭제 차단 — deleteMany에 tenantId 포함(다른 tenant의 첨부는 count=0으로 실패)
{
  const hasGuardedDelete = /tx\.attachment\.deleteMany\(\{\s*where:\s*\{\s*id,\s*tenantId\s*\}\s*\}\)/.test(actionsSource)
  const checksCount = /result\.count\s*===\s*0/.test(actionsSource)
  assertTrue(hasGuardedDelete && checksCount, "T15. deleteAttachment이 {id, tenantId} 조건부 deleteMany로만 삭제하고 count=0(cross-tenant 등)이면 실패 처리")
}

// T16: entity 소유권 재검증 — 조치관리/재발방지관리 모두 tenantId 조건으로 대상 존재 확인
{
  const checksCorrective = /defectCorrectiveAction\.findFirst\(\{\s*where:\s*\{\s*id:\s*entityId,\s*tenantId\s*\}/.test(actionsSource)
  const checksPrevention = /defectRecurrencePrevention\.findFirst\(\{\s*where:\s*\{\s*id:\s*entityId,\s*tenantId\s*\}/.test(actionsSource)
  const rejectsUnknown = /지원하지 않는 업무유형입니다/.test(actionsSource)
  assertTrue(
    checksCorrective && checksPrevention && rejectsUnknown,
    "T16. assertAttachmentEntityOwnership이 조치관리/재발방지관리 각각 {id, tenantId}로 재검증하고, 미지원 entityType은 명시적으로 거부"
  )
}

// T17: 업로드 route — 권한 게이트 + entity 소유권 + 파일 검증을 Storage 업로드보다 먼저 수행
{
  const hasRoleGate = /await requireRole\("OPERATOR"\)/.test(routeSource)
  const hasOwnershipCheck = /await assertAttachmentEntityOwnership\(/.test(routeSource)
  const hasFileValidation = /validateAttachmentFile\(/.test(routeSource)
  const ownershipBeforeUpload = routeSource.indexOf("assertAttachmentEntityOwnership(") < routeSource.indexOf("uploadAttachmentFile(")
  const validationBeforeUpload = routeSource.indexOf("validateAttachmentFile(") < routeSource.indexOf("uploadAttachmentFile(")
  assertTrue(
    hasRoleGate && hasOwnershipCheck && hasFileValidation && ownershipBeforeUpload && validationBeforeUpload,
    "T17. 업로드 API route가 OPERATOR 권한 확인 → entity 소유권 재검증 → 파일 검증을 모두 Storage 업로드 전에 수행"
  )
}

// T17b: storagePath는 sanitize된 ASCII 안전 이름을 쓰고, DB fileName은 원본(한글 포함)을 그대로 저장 — 화면 표시용 파일명과 Storage object key를 분리
{
  const storagePathUsesSafeName = /buildAttachmentStoragePath\(tenantId,\s*entityType,\s*entityId,\s*safeName,/.test(routeSource)
  const dbFileNameUsesOriginal = /fileName:\s*file\.name,/.test(routeSource)
  assertTrue(
    storagePathUsesSafeName && dbFileNameUsesOriginal,
    "T17b. storagePath는 sanitizeFileName을 거친 ASCII 안전 이름(safeName)을 쓰고, DB의 fileName 컬럼은 원본 파일명(file.name, 한글 포함)을 그대로 저장 — 화면에는 원본이 표시되고 Storage key만 ASCII로 제한됨"
  )
}

// T18: 업로드 보상처리 — Storage 성공 후 DB 실패 시 orphan 파일을 정리
{
  const tracksUploadedPath = /uploadedStoragePath\s*=\s*storagePath/.test(routeSource)
  const compensatesOnCatch = /if\s*\(uploadedStoragePath\)[\s\S]*deleteAttachmentFile\(uploadedStoragePath\)/.test(routeSource)
  assertTrue(tracksUploadedPath && compensatesOnCatch, "T18. Storage 업로드 성공 후 DB INSERT 등이 실패하면 catch 블록에서 방금 올린 Storage 객체를 보상 삭제(orphan 방지, § STEP 22)")
}

// T19: 삭제 순서 — DB 삭제(트랜잭션) 완료 후에만 Storage 삭제를 시도
{
  const txIdx = actionsSource.indexOf("await prisma.$transaction(async (tx) => {", actionsSource.indexOf("export async function deleteAttachment"))
  const storageDeleteIdx = actionsSource.indexOf("deleteAttachmentFile(attachment.storagePath)", actionsSource.indexOf("export async function deleteAttachment"))
  assertTrue(txIdx > 0 && storageDeleteIdx > txIdx, "T19. deleteAttachment이 DB 삭제(트랜잭션)를 먼저 완료한 뒤에만 Storage 삭제를 시도(§ STEP 22 순서 원칙)")
}

// T20: AuditLog — 업로드는 CREATE, 삭제는 DELETE로 기존 AuditAction enum을 그대로 사용(새 값 추가 없음)
{
  const uploadAudit = /action:\s*"CREATE"/.test(routeSource) && /entityType:\s*"Attachment"/.test(routeSource)
  const deleteAudit = /action:\s*"DELETE"/.test(actionsSource) && /entityType:\s*"Attachment"/.test(actionsSource)
  const auditSnapshotsMeaningfulFields = /fileName:\s*attachment\.fileName,\s*fileSize:\s*attachment\.fileSize,\s*storagePath:\s*attachment\.storagePath/.test(actionsSource)
  assertTrue(uploadAudit && deleteAudit && auditSnapshotsMeaningfulFields, "T20. 업로드/삭제 모두 AuditLog에 기록되고(entityType='Attachment', action CREATE/DELETE), 삭제 시 fileName/fileSize/storagePath 스냅샷을 남김")
}

// T21: 비공개(private) 버킷 — public 업로드/URL 노출 없음(work-standard의 public 버킷 패턴을 그대로 따르지 않음)
{
  const isPrivateBucket = /public:\s*false/.test(storageSource)
  const usesSignedUrl = /object\/sign\//.test(storageSource)
  const noPublicUrlPattern = !/object\/public\//.test(storageSource)
  assertTrue(isPrivateBucket && usesSignedUrl && noPublicUrlPattern, "T21. attachments 버킷은 비공개(public:false)로 생성하고, 다운로드는 signed URL만 사용하며 공개(public) URL 패턴을 쓰지 않음")
}

// T22: service_role key가 클라이언트 컴포넌트로 노출되지 않음 — storage wrapper는 서버 전용 모듈이고, 첨부 클라이언트 컴포넌트가 이 파일을 직접 import하지 않음
{
  const clientComponentSource = fs.readFileSync("src/components/common/attachments/attachment-section.tsx", "utf8")
  const clientImportsStorageDirectly = /from ["']@\/lib\/storage\/attachment-storage["']/.test(clientComponentSource)
  const clientImportsServiceKey = /SUPABASE_SERVICE_ROLE_KEY/.test(clientComponentSource)
  assertTrue(!clientImportsStorageDirectly && !clientImportsServiceKey, "T22. 첨부파일 UI(클라이언트 컴포넌트)는 Storage 래퍼/service_role key를 직접 import하지 않고, 서버 액션/API route를 통해서만 접근")
}

// ─── T23: 신규 Prisma migration 존재 확인 ────────────────────────────────────
{
  const hasMigration = fs.existsSync("prisma/migrations/20260904030000_add_attachment/migration.sql")
  const migrationSql = hasMigration ? fs.readFileSync("prisma/migrations/20260904030000_add_attachment/migration.sql", "utf8") : ""
  const hasTable = /CREATE TABLE "Attachment"/.test(migrationSql)
  const hasEntityIndex = /CREATE INDEX "Attachment_entityType_entityId_idx"/.test(migrationSql)
  const hasStoragePathUnique = /CREATE UNIQUE INDEX "Attachment_storagePath_key"/.test(migrationSql)
  assertTrue(hasMigration && hasTable && hasEntityIndex && hasStoragePathUnique, "T23. Attachment 테이블 migration이 존재하고, entityType+entityId 인덱스와 storagePath unique 제약을 포함")
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
