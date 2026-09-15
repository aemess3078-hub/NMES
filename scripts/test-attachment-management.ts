/**
 * 사업계획서 "첨부파일관리" code-path test.
 *
 * F20은 기존 generic Attachment 모델을 6개 업무유형으로 확장하고, entity별
 * RolePermission/소유권/삭제정책/부모삭제 보호를 서버 정본으로 강제한다. 이
 * 스크립트는 순수 helper를 직접 검증하고, DB/Storage/network가 필요한 경로는
 * 배포 소스의 구조를 source-check로 확인한다.
 */
import * as fs from "fs"
import {
  ATTACHMENT_ENTITY_TYPES,
  ATTACHMENT_ENTITY_TYPE_LABEL,
  ATTACHMENT_PERMISSION_RESOURCE,
  ALLOWED_ATTACHMENT_EXTENSIONS,
  MAX_ATTACHMENT_FILE_SIZE_BYTES,
  isValidAttachmentEntityType,
  getAttachmentPermissionResource,
  getAttachmentEntityTypeLabel,
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
  if (ok) passed++
  else {
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
  if (cond) passed++
  else {
    failed++
    console.error(`FAIL: ${label}`)
  }
}

const expectedTypes = [
  "QUALITY_INSPECTION",
  "DEFECT_RECORD",
  "DEFECT_CAUSE_ANALYSIS",
  "DEFECT_CORRECTIVE_ACTION",
  "DEFECT_RECURRENCE_PREVENTION",
  "EQUIPMENT_REPAIR_REQUEST",
] as const

// ─── T1~T3: entityType allow-list / labels / permission mapping ─────────────
assertEqual([...ATTACHMENT_ENTITY_TYPES], [...expectedTypes], "T1. 지원 entityType은 F20 범위의 6개로 제한")
for (const type of expectedTypes) {
  assertTrue(isValidAttachmentEntityType(type), `T1. ${type} entityType 허용`)
  assertTrue(Boolean(ATTACHMENT_ENTITY_TYPE_LABEL[type]), `T2. ${type} 한글 라벨 존재`)
  assertEqual(getAttachmentPermissionResource(type), ATTACHMENT_PERMISSION_RESOURCE[type], `T3. ${type} 권한 리소스 매핑 정본`)
}
assertEqual(ATTACHMENT_PERMISSION_RESOURCE.QUALITY_INSPECTION, "QUALITY_INSPECTION", "T3. 품질검사는 QUALITY_INSPECTION 권한 사용")
assertEqual(ATTACHMENT_PERMISSION_RESOURCE.DEFECT_RECORD, "DEFECT_MANAGEMENT", "T3. 불량기록은 DEFECT_MANAGEMENT 권한 사용")
assertEqual(ATTACHMENT_PERMISSION_RESOURCE.DEFECT_CAUSE_ANALYSIS, "DEFECT_MANAGEMENT", "T3. 원인분석은 DEFECT_MANAGEMENT 권한 사용")
assertEqual(ATTACHMENT_PERMISSION_RESOURCE.DEFECT_CORRECTIVE_ACTION, "DEFECT_MANAGEMENT", "T3. 조치관리는 DEFECT_MANAGEMENT 권한 사용")
assertEqual(ATTACHMENT_PERMISSION_RESOURCE.DEFECT_RECURRENCE_PREVENTION, "DEFECT_MANAGEMENT", "T3. 재발방지는 DEFECT_MANAGEMENT 권한 사용")
assertEqual(ATTACHMENT_PERMISSION_RESOURCE.EQUIPMENT_REPAIR_REQUEST, "EQUIPMENT_REPAIR", "T3. 설비수리요청은 EQUIPMENT_REPAIR 권한 사용")
assertTrue(!isValidAttachmentEntityType("RANDOM_TYPE"), "T1. allow-list에 없는 임의 문자열은 차단")
assertEqual(getAttachmentPermissionResource("RANDOM_TYPE"), null, "T3. 미지원 entityType은 권한 리소스를 만들지 않음")
assertEqual(getAttachmentEntityTypeLabel("RANDOM_TYPE"), "알 수 없는 업무유형", "T2. 미지원 entityType은 안전한 알 수 없음 라벨 표시")

// ─── T4~T7: 파일 검증 ───────────────────────────────────────────────────────
assertEqual(getFileExtension("report.pdf"), "pdf", "T4. 확장자 추출")
assertEqual(getFileExtension("REPORT.PDF"), "pdf", "T4. 확장자 대소문자 무시")
assertEqual(getFileExtension("noext"), "", "T4. 확장자 없는 파일명")
for (const ext of ALLOWED_ATTACHMENT_EXTENSIONS) {
  try {
    validateAttachmentFile(`file.${ext}`, 1024)
    passed++
  } catch {
    failed++
    console.error(`FAIL: T5. 허용 확장자(${ext})는 통과해야 함`)
  }
}
assertThrows(() => validateAttachmentFile("virus.exe", 1024), "T6. exe 확장자 차단")
assertThrows(() => validateAttachmentFile("script.js", 1024), "T6. js 확장자 차단")
assertThrows(() => validateAttachmentFile("archive.zip", 1024), "T6. zip은 허용하지 않음")
assertThrows(() => validateAttachmentFile("empty.pdf", 0), "T7. 빈 파일 차단")
assertThrows(() => validateAttachmentFile("huge.pdf", MAX_ATTACHMENT_FILE_SIZE_BYTES + 1), "T7. 최대 크기 초과 차단")

// ─── T8~T10: storagePath / 표시 formatter ───────────────────────────────────
assertEqual(sanitizeFileName("../../etc/passwd"), "passwd", "T8. 경로 문자열은 마지막 세그먼트만 사용")
assertEqual(sanitizeFileName("my report (final).pdf"), "my_report_final.pdf", "T8. storage key 안전 파일명")
assertEqual(sanitizeFileName("불량사진_2026.jpg"), "_2026.jpg", "T8. storagePath는 비-ASCII 제거, 원본명은 DB 보존")
assertEqual(buildAttachmentStoragePath("tenant-1", "QUALITY_INSPECTION", "qi-1", "report.pdf", "uuid-1234"), "tenant-1/QUALITY_INSPECTION/qi-1/uuid-1234-report.pdf", "T9. storagePath는 tenant/entityType/entityId/uuid-파일명 구조")
assertEqual(formatFileSize(500), "500 B", "T10. 파일 크기 B 표시")
assertEqual(formatFileSize(1024), "1.0 KB", "T10. 파일 크기 KB 표시")
assertEqual(formatFileSize(1.4 * 1024 * 1024), "1.4 MB", "T10. 파일 크기 MB 표시")

// ─── T11~T13: 직렬화 ────────────────────────────────────────────────────────
function makeRecord(overrides: Partial<AttachmentRecordLike> & { id: string }): AttachmentRecordLike {
  return {
    id: overrides.id,
    entityType: overrides.entityType ?? "QUALITY_INSPECTION",
    entityId: overrides.entityId ?? "qi-1",
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
  const row = serializeAttachmentRow(makeRecord({ id: "att-1" }), new Map([["qi-1", "[WO-2026-021] [ITEM] 품목 · FINAL"]]))
  assertEqual(row.entityLabel, "[WO-2026-021] [ITEM] 품목 · FINAL", "T11. 연결대상 라벨 병합")
  assertEqual(row.entityTypeLabel, "품질검사", "T11. entityType 라벨 변환")
}
{
  const row = serializeAttachmentRow(makeRecord({ id: "att-2", entityId: "missing" }), new Map())
  assertEqual(row.entityLabel, "(연결대상 없음)", "T12. 라벨이 없으면 연결대상 없음")
}
{
  const row = serializeAttachmentRow(makeRecord({ id: "att-3", entityType: "LEGACY_UNKNOWN" }), new Map())
  assertEqual(row.entityType, "LEGACY_UNKNOWN", "T13. 알 수 없는 entityType을 임의 지원 유형으로 바꾸지 않음")
  assertEqual(row.entityTypeLabel, "알 수 없는 업무유형", "T13. 알 수 없는 entityType 라벨")
}

// ─── T14~T31: source-check ──────────────────────────────────────────────────
const actionsSource = fs.readFileSync("src/lib/actions/attachment.actions.ts", "utf8")
const routeSource = fs.readFileSync("src/app/api/upload/attachment/route.ts", "utf8")
const storageSource = fs.readFileSync("src/lib/storage/attachment-storage.ts", "utf8")
const rolePermissionSource = fs.readFileSync("src/lib/auth/role-permissions.ts", "utf8")
const qualitySource = fs.readFileSync("src/lib/actions/quality.actions.ts", "utf8")
const equipmentSource = fs.readFileSync("src/lib/actions/equipment-management.actions.ts", "utf8")
const attachmentSectionSource = fs.readFileSync("src/components/common/attachments/attachment-section.tsx", "utf8")
const attachmentsClientSource = fs.readFileSync("src/app/app/mes/attachments/attachments-client.tsx", "utf8")
const inspectionDetailSource = fs.readFileSync("src/app/app/mes/inspection/inspection-detail-dialog.tsx", "utf8")
const causeAnalysisSource = fs.readFileSync("src/app/app/mes/quality/cause-analysis/cause-analysis-client.tsx", "utf8")
const repairSheetSource = fs.readFileSync("src/app/app/mes/equipment-repair/repair-form-sheet.tsx", "utf8")

for (const type of expectedTypes) {
  assertTrue(actionsSource.includes(`entityType === "${type}"`) || actionsSource.includes(`"${type}"`), `T14. ${type} 소유권/정책 경로 존재`)
}
assertTrue(/qualityInspection\.findFirst\([\s\S]*workOrderOperation:[\s\S]*workOrder:[\s\S]*tenantId/.test(actionsSource), "T15. QUALITY_INSPECTION은 workOrder tenant lineage로 소유권 확인")
assertTrue(/defectRecord\.findFirst\([\s\S]*qualityInspection:[\s\S]*workOrderOperation:[\s\S]*tenantId/.test(actionsSource), "T15. DEFECT_RECORD는 검사→작업지시 tenant lineage로 소유권 확인")
assertTrue(/equipmentRepairRequest\.findFirst\(\{ where: \{ id: entityId, tenantId \}/.test(actionsSource), "T15. 설비수리요청은 tenantId 직접 확인")

assertTrue(/requireAttachmentEntityPermission\(entityType, "CREATE", actor\)/.test(routeSource), "T16. 업로드는 entity 소유권 확인 후 CREATE 권한 확인")
assertTrue(routeSource.indexOf("assertAttachmentEntityOwnership") < routeSource.indexOf("requireAttachmentEntityPermission(entityType, \"CREATE\", actor)"), "T16. 업로드 순서: 소유권 후 CREATE 권한")
{
  const postBody = routeSource.slice(routeSource.indexOf("export async function POST"))
  assertTrue(postBody.indexOf("requireAttachmentEntityPermission(entityType, \"CREATE\", actor)") < postBody.indexOf("validateAttachmentFile(file.name, file.size)"), "T16. 업로드 순서: CREATE 권한 후 파일 검증")
}
assertTrue(/getAttachments\([\s\S]*hasResourcePermission\(snapshot, getRequiredAttachmentResource\(filter\.entityType\), "READ"\)/.test(actionsSource), "T17. entity별 목록은 READ 권한을 서버에서 확인")
assertTrue(/entityType: \{ in: readableTypes \}/.test(actionsSource), "T17. 전체 첨부 목록은 READ 가능한 entityType만 서버에서 필터링")
assertTrue(/getAttachmentDownloadUrl[\s\S]*requireAttachmentEntityPermission\(attachment\.entityType, "READ"\)/.test(actionsSource), "T18. 다운로드 signed URL 발급은 READ 권한 확인")
assertTrue(/deleteAttachment[\s\S]*requireAttachmentEntityPermission\(attachment\.entityType, "DELETE", actor\)/.test(actionsSource), "T19. 삭제는 DELETE 권한 확인")

assertTrue(/ATTACHMENT_MENU_CODES = new Set\(\["attachments"\]\)/.test(rolePermissionSource), "T20. attachments 메뉴는 단일 arbitrary resource 매핑 대신 특수 처리")
assertTrue(/ATTACHMENT_READ_RESOURCES = \["QUALITY_INSPECTION", "DEFECT_MANAGEMENT", "EQUIPMENT_REPAIR"\]/.test(rolePermissionSource), "T20. attachments 메뉴는 지원 entityType의 READ 리소스 중 하나라도 있으면 표시")
assertTrue(/canReadMenuCode[\s\S]*ATTACHMENT_READ_RESOURCES\.some/.test(rolePermissionSource), "T20. attachments 메뉴 READ 판정은 any-resource 방식")

assertTrue(/function assertAttachmentDeleteAllowed/.test(actionsSource), "T21. 첨부 삭제 정책 helper 존재")
assertTrue(/QUALITY_INSPECTION[\s\S]*defectRecord\.count/.test(actionsSource), "T22. 불량 이력이 있는 품질검사 첨부 삭제 차단")
assertTrue(/DEFECT_RECORD[\s\S]*defectCauseAnalysis\.count[\s\S]*defectCorrectiveAction\.count[\s\S]*defectRecurrencePrevention\.count/.test(actionsSource), "T22. downstream 품질이력이 있는 불량기록 첨부 삭제 차단")
assertTrue(/DEFECT_CAUSE_ANALYSIS[\s\S]*defectCorrectiveAction\.count[\s\S]*defectRecurrencePrevention\.count/.test(actionsSource), "T22. 조치/재발방지가 있는 원인분석 첨부 삭제 차단")
assertTrue(/DEFECT_CORRECTIVE_ACTION[\s\S]*status === "COMPLETED"/.test(actionsSource), "T22. 완료 조치관리 첨부 삭제 차단")
assertTrue(/DEFECT_RECURRENCE_PREVENTION[\s\S]*status === "COMPLETED"/.test(actionsSource), "T22. 완료 재발방지 첨부 삭제 차단")
assertTrue(/EQUIPMENT_REPAIR_REQUEST[\s\S]*status === "COMPLETED"[\s\S]*status === "CANCELLED"[\s\S]*completedAt/.test(actionsSource), "T22. 완료/취소/완료일 있는 수리요청 첨부 삭제 차단")

assertTrue(/assertNoAttachmentsForEntity\(tx, tenantId, "QUALITY_INSPECTION", id\)/.test(qualitySource), "T23. 품질검사 부모 삭제 전 검사 첨부 존재 확인")
assertTrue(/assertNoAttachmentsForEntity\(tx, tenantId, "DEFECT_RECORD", defectRecord\.id\)/.test(qualitySource), "T23. 품질검사 삭제 시 하위 불량기록 첨부 orphan 방지")
assertTrue(/assertNoAttachmentsForEntity\(tx, tenantId, "EQUIPMENT_REPAIR_REQUEST", id\)/.test(equipmentSource), "T23. 설비수리요청 부모 삭제 전 첨부 존재 확인")
assertTrue(actionsSource.includes("연결된 첨부파일이 있어 삭제할 수 없습니다."), "T23. 부모 삭제 차단 메시지 정본")

assertTrue(/tx\.attachment\.deleteMany\(\{ where: \{ id, tenantId \} \}\)/.test(actionsSource), "T24. 첨부 삭제는 tenant 조건부 DB delete")
assertTrue(/deleteAttachmentFile\(attachment\.storagePath\)/.test(actionsSource), "T24. DB 삭제 후 storage 삭제 시도")
assertTrue(/entityType: "AttachmentStorageCleanup"/.test(actionsSource), "T25. storage 삭제 실패 시 durable AuditLog 기록")
assertTrue(/cleanupStatus: "FAILED"/.test(actionsSource), "T25. storage cleanup 실패 상태 기록")

assertTrue(/public:\s*false/.test(storageSource), "T26. attachments 버킷은 private")
assertTrue(/object\/sign\//.test(storageSource), "T26. 다운로드는 signed URL")
assertTrue(!/object\/public\//.test(storageSource), "T26. public URL 패턴 없음")

assertTrue(/getAttachmentPermissionFlags\(entityType\)/.test(attachmentSectionSource), "T27. AttachmentSection은 서버 권한 플래그 조회")
assertTrue(/!permissions\.canRead\) return null/.test(attachmentSectionSource), "T27. READ 없으면 섹션 숨김")
assertTrue(/permissions\?\.canCreate/.test(attachmentSectionSource), "T27. CREATE 없으면 업로드 UI 숨김")
assertTrue(/permissions\?\.canDelete/.test(attachmentSectionSource), "T27. DELETE 없으면 삭제 UI 숨김")
assertTrue(/row\.original\.canDelete/.test(attachmentsClientSource), "T28. 전체 목록 삭제 버튼은 행별 DELETE 권한 플래그 사용")

assertTrue(/entityType="QUALITY_INSPECTION"/.test(inspectionDetailSource), "T29. 품질검사 상세에 첨부 섹션 연결")
assertTrue(/entityType="DEFECT_RECORD"/.test(inspectionDetailSource), "T29. 불량기록 상세 영역에 첨부 섹션 연결")
assertTrue(/entityType="DEFECT_CAUSE_ANALYSIS"/.test(causeAnalysisSource), "T29. 원인분석 상세에 첨부 섹션 연결")
assertTrue(/entityType="EQUIPMENT_REPAIR_REQUEST"/.test(repairSheetSource), "T29. 설비수리요청 상세에 첨부 섹션 연결")
assertTrue(/entityType="DEFECT_CORRECTIVE_ACTION"/.test(fs.readFileSync("src/app/app/mes/quality/corrective-action/corrective-action-detail-sheet.tsx", "utf8")), "T30. 기존 조치관리 첨부 연결 유지")
assertTrue(/entityType="DEFECT_RECURRENCE_PREVENTION"/.test(fs.readFileSync("src/app/app/mes/quality/recurrence-prevention/recurrence-prevention-detail-sheet.tsx", "utf8")), "T30. 기존 재발방지 첨부 연결 유지")

assertTrue(/buildEntityLabelMap[\s\S]*Promise\.all/.test(actionsSource), "T31. entity label은 type별 배치 조회로 구성")
assertTrue(/requestNo[\s\S]*equipment:[\s\S]*code:[\s\S]*name:/.test(actionsSource), "T31. 설비수리요청 라벨은 설비코드/명과 요청번호를 포함")

// ─── T32: migration은 F20에서 추가하지 않음 ────────────────────────────────
{
  const migrations = fs.readdirSync("prisma/migrations").filter((name) => name.includes("attachment") && name !== "20260904030000_add_attachment")
  assertEqual(migrations, [], "T32. F20은 기존 Attachment 모델만 재사용하고 신규 attachment migration을 추가하지 않음")
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
