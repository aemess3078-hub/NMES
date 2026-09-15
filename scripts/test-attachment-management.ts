/**
 * 사업계획서 "첨부파일관리" code-path test.
 *
 * F20은 기존 generic Attachment 모델을 6개 업무유형으로 확장하고, entity별
 * RolePermission/소유권/삭제정책/부모삭제 보호를 서버 정본으로 강제한다. 이
 * 스크립트는 순수 helper를 직접 검증하고, DB/Storage/network가 필요한 경로는
 * 배포 소스의 구조를 source-check로 확인한다.
 */
import * as fs from "fs"
import { register } from "tsconfig-paths"
import { PermissionAction, Prisma } from "@prisma/client"
import { prisma } from "../src/lib/db/prisma"
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

register({
  baseUrl: process.cwd(),
  paths: { "@/*": ["src/*"] },
})

const {
  assertAttachmentDeleteAllowed,
  assertAttachmentEntityOwnership,
  assertNoAttachmentsForEntity,
  recordAttachmentStorageCleanupFailure,
  requireAttachmentEntityPermission,
} = require("../src/lib/actions/attachment.actions") as typeof import("../src/lib/actions/attachment.actions")

const {
  getCurrentPermissionSnapshot,
  getResourcePermissionFlags,
} = require("../src/lib/auth/role-permissions") as typeof import("../src/lib/auth/role-permissions")

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

async function assertAsyncThrows(fn: () => Promise<unknown>, label: string) {
  try {
    await fn()
    failed++
    console.error(`FAIL: ${label} (에러가 발생하지 않음)`)
  } catch {
    passed++
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
assertTrue(/ROLE_PERMISSION_DENIED_MESSAGE/.test(routeSource), "T16. 업로드 route가 RolePermission 정본 거부 메시지를 재사용")
assertTrue(/message === "UNAUTHORIZED"[\s\S]*status: 401/.test(routeSource), "T16. 미로그인 업로드는 401로 분리")
assertTrue(/ROLE_PERMISSION_DENIED_MESSAGE[\s\S]*status: 403/.test(routeSource), "T16. CREATE 권한 부족은 403으로 분리")
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
assertTrue(!/assertNoAttachmentsForEntity\(tx, tenantId, "DEFECT_RECORD", defectRecord\.id\)/.test(qualitySource), "T23. assertInspectionHistoryMutable 뒤 도달 불가능한 하위 불량기록 첨부 loop는 제거")
assertTrue(/assertNoAttachmentsForEntity\(tx, tenantId, "EQUIPMENT_REPAIR_REQUEST", id\)/.test(equipmentSource), "T23. 설비수리요청 부모 삭제 전 첨부 존재 확인")
assertTrue(actionsSource.includes("연결된 첨부파일이 있어 삭제할 수 없습니다."), "T23. 부모 삭제 차단 메시지 정본")

assertTrue(/tx\.attachment\.deleteMany\(\{ where: \{ id, tenantId \} \}\)/.test(actionsSource), "T24. 첨부 삭제는 tenant 조건부 DB delete")
assertTrue(/deleteAttachmentFile\(attachment\.storagePath\)/.test(actionsSource), "T24. DB 삭제 후 storage 삭제 시도")
assertTrue(/entityType: "AttachmentStorageCleanup"/.test(actionsSource), "T25. storage 삭제 실패 시 durable AuditLog 기록")
assertTrue(/cleanupStatus: "FAILED"/.test(actionsSource), "T25. storage cleanup 실패 상태 기록")
assertTrue(/function recordAttachmentStorageCleanupFailure/.test(actionsSource), "T25. storage cleanup 실패 기록은 production helper로 분리")
assertTrue(/catch \(auditError\)[\s\S]*console\.error/.test(actionsSource), "T25. cleanup AuditLog 기록 실패는 console.error fallback 후 삭제 성공을 유지")

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

type FixtureTenant = {
  tenantId: string
  siteId: string
  workCenterId: string
  itemId: string
  bomId: string
  routingId: string
  routingOperationId: string
  workOrderId: string
  workOrderOperationId: string
  inspectionSpecId: string
  profileId: string
  defectCodeId: string
  qualityInspectionId: string
  repairRequestId: string
  equipmentId: string
  currentUser: {
    id: string
    profileId: string
    loginId: string
    email: string
    name: string
    tenantId: string
    role: "MANAGER"
    isActive: boolean
    mustChangePw: boolean
  }
}

function dbRefGuard() {
  const databaseUrl = process.env.DATABASE_URL ?? ""
  if (!databaseUrl.includes("zgjoiyqtfivywajygevj")) {
    throw new Error("test:attachment-management actual DB checks require Cheongun Supabase DATABASE_URL (zgjoiyqtfivywajygevj).")
  }
  if (databaseUrl.includes("rkglajpajtuavmptidur")) {
    throw new Error("CNS Supabase project ref detected in DATABASE_URL; aborting F20 attachment test.")
  }
}

async function cleanupFixture(prefix: string) {
  const tenantIds = [`${prefix}-tenant-a`, `${prefix}-tenant-b`]
  const profileIds = [`${prefix}-profile-a`, `${prefix}-profile-b`]

  await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.attachment.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.defectRecurrencePrevention.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.defectCorrectiveAction.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.defectCauseAnalysis.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.defectRecord.deleteMany({ where: { qualityInspection: { workOrderOperation: { workOrder: { tenantId: { in: tenantIds } } } } } })
  await prisma.inspectionMeasurement.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.qualityInspection.deleteMany({ where: { workOrderOperation: { workOrder: { tenantId: { in: tenantIds } } } } })
  await prisma.inspectionItem.deleteMany({ where: { inspectionSpec: { tenantId: { in: tenantIds } } } })
  await prisma.inspectionSpec.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.defectCode.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.equipmentRepairRequest.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.equipment.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.workOrderOperation.deleteMany({ where: { workOrder: { tenantId: { in: tenantIds } } } })
  await prisma.workOrder.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.routingOperation.deleteMany({ where: { routing: { tenantId: { in: tenantIds } } } })
  await prisma.routing.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.bOMItem.deleteMany({ where: { bom: { tenantId: { in: tenantIds } } } })
  await prisma.bOM.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.workCenter.deleteMany({ where: { site: { tenantId: { in: tenantIds } } } })
  await prisma.item.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.rolePermission.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.userCredential.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.tenantUser.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.site.deleteMany({ where: { tenantId: { in: tenantIds } } })
  await prisma.profile.deleteMany({ where: { id: { in: profileIds } } })
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } })
}

async function createFixtureTenant(prefix: string, key: "a" | "b"): Promise<FixtureTenant> {
  const tenantId = `${prefix}-tenant-${key}`
  const profileId = `${prefix}-profile-${key}`
  const siteId = `${prefix}-site-${key}`
  const workCenterId = `${prefix}-wc-${key}`
  const itemId = `${prefix}-item-${key}`
  const bomId = `${prefix}-bom-${key}`
  const routingId = `${prefix}-routing-${key}`
  const routingOperationId = `${prefix}-rop-${key}`
  const workOrderId = `${prefix}-wo-${key}`
  const workOrderOperationId = `${prefix}-woo-${key}`
  const inspectionSpecId = `${prefix}-spec-${key}`
  const defectCodeId = `${prefix}-dc-${key}`
  const equipmentId = `${prefix}-eq-${key}`
  const repairRequestId = `${prefix}-rr-${key}`
  const qualityInspectionId = `${prefix}-qi-${key}`

  await prisma.tenant.create({ data: { id: tenantId, code: `F20ATT${key.toUpperCase()}${prefix.slice(-6)}`, name: `F20 Attachment ${key}` } })
  await prisma.profile.create({ data: { id: profileId, email: `${profileId}@example.test`, name: `F20 Manager ${key}` } })
  await prisma.userCredential.create({ data: { tenantId, profileId, loginId: `f20-${key}-${prefix.slice(-6)}`, passwordHash: "not-used", mustChangePw: false } })
  await prisma.site.create({ data: { id: siteId, tenantId, code: `SITE-${key}`, name: `F20 Site ${key}` } })
  await prisma.tenantUser.create({ data: { tenantId, profileId, siteId, role: "MANAGER", isActive: true } })
  await prisma.workCenter.create({ data: { id: workCenterId, siteId, code: `WC-${key}`, name: `F20 WC ${key}` } })
  await prisma.item.create({ data: { id: itemId, tenantId, code: `ITEM-${key}`, name: `F20 Item ${key}`, itemType: "FINISHED", uom: "EA" } })
  await prisma.bOM.create({ data: { id: bomId, tenantId, itemId, version: "F20", status: "ACTIVE", isDefault: true } })
  await prisma.routing.create({ data: { id: routingId, tenantId, code: `RT-${key}`, name: `F20 Routing ${key}`, version: "F20", status: "ACTIVE", scope: "COMMON" } })
  await prisma.routingOperation.create({ data: { id: routingOperationId, routingId, workCenterId, seq: 10, operationCode: `OP-${key}`, name: `F20 Operation ${key}` } })
  await prisma.workOrder.create({
    data: {
      id: workOrderId,
      tenantId,
      siteId,
      itemId,
      bomId,
      routingId,
      orderNo: `WO-F20-${key}-${prefix.slice(-6)}`,
      manufacturingNo: `MFG-F20-${key}-${prefix.slice(-6)}`,
      plannedQty: new Prisma.Decimal(10),
      status: "DRAFT",
    },
  })
  await prisma.workOrderOperation.create({
    data: { id: workOrderOperationId, workOrderId, routingOperationId, seq: 10, plannedQty: new Prisma.Decimal(10), status: "PENDING" },
  })
  await prisma.inspectionSpec.create({ data: { id: inspectionSpecId, tenantId, itemId, routingOperationId, version: "F20", status: "ACTIVE" } })
  await prisma.defectCode.create({ data: { id: defectCodeId, tenantId, code: `DF-${key}`, name: `F20 Defect ${key}`, defectCategory: "VISUAL" } })
  await prisma.equipment.create({
    data: { id: equipmentId, tenantId, siteId, workCenterId, code: `EQ-${key}`, name: `F20 Equipment ${key}`, equipmentType: "MACHINE", status: "ACTIVE" },
  })
  await prisma.equipmentRepairRequest.create({
    data: {
      id: repairRequestId,
      tenantId,
      siteId,
      equipmentId,
      requestNo: `RR-F20-${key}-${prefix.slice(-6)}`,
      title: `F20 repair ${key}`,
      priority: "MEDIUM",
      status: "OPEN",
      requestedBy: profileId,
    },
  })
  await prisma.qualityInspection.create({
    data: {
      id: qualityInspectionId,
      workOrderOperationId,
      inspectionSpecId,
      inspectorId: profileId,
      stage: "FINAL",
      result: "PASS",
      inspectedQty: new Prisma.Decimal(1),
    },
  })

  return {
    tenantId,
    siteId,
    workCenterId,
    itemId,
    bomId,
    routingId,
    routingOperationId,
    workOrderId,
    workOrderOperationId,
    inspectionSpecId,
    profileId,
    defectCodeId,
    qualityInspectionId,
    repairRequestId,
    equipmentId,
    currentUser: {
      id: profileId,
      profileId,
      loginId: `f20-${key}-${prefix.slice(-6)}`,
      email: `${profileId}@example.test`,
      name: `F20 Manager ${key}`,
      tenantId,
      role: "MANAGER",
      isActive: true,
      mustChangePw: false,
    },
  }
}

async function addAttachment(tenant: FixtureTenant, entityType: string, entityId: string, suffix: string) {
  return prisma.attachment.create({
    data: {
      tenantId: tenant.tenantId,
      entityType,
      entityId,
      fileName: `${suffix}.pdf`,
      storagePath: `${tenant.tenantId}/${entityType}/${entityId}/${suffix}.pdf`,
      mimeType: "application/pdf",
      fileSize: 100,
      uploadedById: tenant.profileId,
    },
  })
}

async function runActualDbChecks() {
  dbRefGuard()
  const prefix = `f20-att-${Date.now()}`
  await cleanupFixture(prefix)
  let fixtureA: FixtureTenant | null = null
  let fixtureB: FixtureTenant | null = null

  try {
    fixtureA = await createFixtureTenant(prefix, "a")
    fixtureB = await createFixtureTenant(prefix, "b")

    const repairAttachment = await addAttachment(fixtureA, "EQUIPMENT_REPAIR_REQUEST", fixtureA.repairRequestId, "repair-a")
    const tenantBRead = await prisma.attachment.findFirst({ where: { id: repairAttachment.id, tenantId: fixtureB.tenantId } })
    assertEqual(tenantBRead, null, "T33. tenant B 조건으로 tenant A Attachment 조회 불가")
    const tenantBDelete = await prisma.attachment.deleteMany({ where: { id: repairAttachment.id, tenantId: fixtureB.tenantId } })
    assertEqual(tenantBDelete.count, 0, "T33. tenant B 조건으로 tenant A Attachment 삭제 불가")
    await assertAsyncThrows(
      () => assertAttachmentEntityOwnership("EQUIPMENT_REPAIR_REQUEST", fixtureB!.repairRequestId, fixtureA!.tenantId),
      "T33. direct tenant FK parent id를 다른 tenant ownership validator에 넣으면 차단"
    )
    await assertAsyncThrows(
      () => assertAttachmentEntityOwnership("QUALITY_INSPECTION", fixtureB!.qualityInspectionId, fixtureA!.tenantId),
      "T33. lineage FK parent id를 다른 tenant ownership validator에 넣으면 차단"
    )

    const qiNoDefect = fixtureA.qualityInspectionId
    const qiWithDefect = `${prefix}-qi-defect`
    await prisma.qualityInspection.create({
      data: {
        id: qiWithDefect,
        workOrderOperationId: fixtureA.workOrderOperationId,
        inspectionSpecId: fixtureA.inspectionSpecId,
        inspectorId: fixtureA.profileId,
        stage: "FINAL",
        result: "FAIL",
        inspectedQty: new Prisma.Decimal(1),
      },
    })
    const defectNoDownstream = await prisma.defectRecord.create({
      data: { id: `${prefix}-dr-open`, qualityInspectionId: qiWithDefect, defectCodeId: fixtureA.defectCodeId, qty: new Prisma.Decimal(1), severity: "MAJOR" },
    })
    await assertAttachmentDeleteAllowed("QUALITY_INSPECTION", qiNoDefect, fixtureA.tenantId)
    passed++
    await assertAsyncThrows(
      () => assertAttachmentDeleteAllowed("QUALITY_INSPECTION", qiWithDefect, fixtureA!.tenantId),
      "T34. DefectRecord가 있는 QUALITY_INSPECTION 첨부 삭제 정책 차단"
    )
    await assertAttachmentDeleteAllowed("DEFECT_RECORD", defectNoDownstream.id, fixtureA.tenantId)
    passed++
    await prisma.defectCauseAnalysis.create({
      data: {
        id: `${prefix}-cause`,
        tenantId: fixtureA.tenantId,
        defectRecordId: defectNoDownstream.id,
        rootCause: "fixture",
        createdById: fixtureA.profileId,
        updatedById: fixtureA.profileId,
      },
    })
    await assertAsyncThrows(
      () => assertAttachmentDeleteAllowed("DEFECT_RECORD", defectNoDownstream.id, fixtureA!.tenantId),
      "T34. CauseAnalysis가 있는 DEFECT_RECORD 첨부 삭제 정책 차단"
    )

    const correctiveOpen = await prisma.defectCorrectiveAction.create({
      data: {
        id: `${prefix}-ca-open`,
        tenantId: fixtureA.tenantId,
        defectRecordId: defectNoDownstream.id,
        actionContent: "open",
        dueDate: new Date(),
        status: "OPEN",
        createdById: fixtureA.profileId,
        updatedById: fixtureA.profileId,
      },
    })
    const correctiveDone = await prisma.defectCorrectiveAction.create({
      data: {
        id: `${prefix}-ca-done`,
        tenantId: fixtureA.tenantId,
        defectRecordId: defectNoDownstream.id,
        actionContent: "done",
        dueDate: new Date(),
        status: "COMPLETED",
        completedAt: new Date(),
        createdById: fixtureA.profileId,
        updatedById: fixtureA.profileId,
      },
    })
    await assertAttachmentDeleteAllowed("DEFECT_CORRECTIVE_ACTION", correctiveOpen.id, fixtureA.tenantId)
    passed++
    await assertAsyncThrows(
      () => assertAttachmentDeleteAllowed("DEFECT_CORRECTIVE_ACTION", correctiveDone.id, fixtureA!.tenantId),
      "T34. COMPLETED 조치관리 첨부 삭제 정책 차단"
    )

    const preventionProgress = await prisma.defectRecurrencePrevention.create({
      data: {
        id: `${prefix}-rp-progress`,
        tenantId: fixtureA.tenantId,
        defectRecordId: defectNoDownstream.id,
        preventionContent: "progress",
        dueDate: new Date(),
        status: "VERIFYING",
        createdById: fixtureA.profileId,
        updatedById: fixtureA.profileId,
      },
    })
    const preventionDone = await prisma.defectRecurrencePrevention.create({
      data: {
        id: `${prefix}-rp-done`,
        tenantId: fixtureA.tenantId,
        defectRecordId: defectNoDownstream.id,
        preventionContent: "done",
        dueDate: new Date(),
        status: "COMPLETED",
        completedAt: new Date(),
        createdById: fixtureA.profileId,
        updatedById: fixtureA.profileId,
      },
    })
    await assertAttachmentDeleteAllowed("DEFECT_RECURRENCE_PREVENTION", preventionProgress.id, fixtureA.tenantId)
    passed++
    await assertAsyncThrows(
      () => assertAttachmentDeleteAllowed("DEFECT_RECURRENCE_PREVENTION", preventionDone.id, fixtureA!.tenantId),
      "T34. COMPLETED 재발방지 첨부 삭제 정책 차단"
    )

    await assertAttachmentDeleteAllowed("EQUIPMENT_REPAIR_REQUEST", fixtureA.repairRequestId, fixtureA.tenantId)
    passed++
    const repairDone = await prisma.equipmentRepairRequest.create({
      data: {
        id: `${prefix}-rr-done`,
        tenantId: fixtureA.tenantId,
        siteId: fixtureA.siteId,
        equipmentId: fixtureA.equipmentId,
        requestNo: `RR-F20-DONE-${prefix.slice(-6)}`,
        title: "done",
        priority: "MEDIUM",
        status: "COMPLETED",
        requestedBy: fixtureA.profileId,
        completedAt: new Date(),
      },
    })
    const repairCancelled = await prisma.equipmentRepairRequest.create({
      data: {
        id: `${prefix}-rr-cancelled`,
        tenantId: fixtureA.tenantId,
        siteId: fixtureA.siteId,
        equipmentId: fixtureA.equipmentId,
        requestNo: `RR-F20-CANCEL-${prefix.slice(-6)}`,
        title: "cancelled",
        priority: "MEDIUM",
        status: "CANCELLED",
        requestedBy: fixtureA.profileId,
      },
    })
    await assertAsyncThrows(
      () => assertAttachmentDeleteAllowed("EQUIPMENT_REPAIR_REQUEST", repairDone.id, fixtureA!.tenantId),
      "T34. COMPLETED 수리요청 첨부 삭제 정책 차단"
    )
    await assertAsyncThrows(
      () => assertAttachmentDeleteAllowed("EQUIPMENT_REPAIR_REQUEST", repairCancelled.id, fixtureA!.tenantId),
      "T34. CANCELLED 수리요청 첨부 삭제 정책 차단"
    )

    await assertNoAttachmentsForEntity(prisma, fixtureA.tenantId, "QUALITY_INSPECTION", qiNoDefect)
    passed++
    await addAttachment(fixtureA, "QUALITY_INSPECTION", qiNoDefect, "qi-parent")
    await assertAsyncThrows(
      () => assertNoAttachmentsForEntity(prisma, fixtureA!.tenantId, "QUALITY_INSPECTION", qiNoDefect),
      "T35. QUALITY_INSPECTION attachment 존재 시 parent delete guard 차단"
    )
    await assertNoAttachmentsForEntity(prisma, fixtureA.tenantId, "EQUIPMENT_REPAIR_REQUEST", repairDone.id)
    passed++
    await addAttachment(fixtureA, "EQUIPMENT_REPAIR_REQUEST", repairDone.id, "repair-parent")
    await assertAsyncThrows(
      () => assertNoAttachmentsForEntity(prisma, fixtureA!.tenantId, "EQUIPMENT_REPAIR_REQUEST", repairDone.id),
      "T35. EQUIPMENT_REPAIR_REQUEST attachment 존재 시 parent delete guard 차단"
    )

    await prisma.rolePermission.createMany({
      data: [
        { tenantId: fixtureA.tenantId, role: "MANAGER", resource: "DEFECT_MANAGEMENT", action: "READ", isAllowed: true },
        { tenantId: fixtureA.tenantId, role: "MANAGER", resource: "DEFECT_MANAGEMENT", action: "CREATE", isAllowed: false },
        { tenantId: fixtureA.tenantId, role: "MANAGER", resource: "DEFECT_MANAGEMENT", action: "DELETE", isAllowed: false },
      ],
    })
    const snapshotReadOnly = await getCurrentPermissionSnapshot(fixtureA.currentUser)
    const readOnlyFlags = getResourcePermissionFlags(snapshotReadOnly, "DEFECT_MANAGEMENT")
    assertTrue(readOnlyFlags.canRead && !readOnlyFlags.canCreate && !readOnlyFlags.canDelete, "T36. RolePermission fixture READ true / CREATE false / DELETE false")
    await assertAsyncThrows(
      () => requireAttachmentEntityPermission("DEFECT_RECORD", "CREATE", fixtureA!.currentUser),
      "T36. DEFECT_MANAGEMENT CREATE false이면 upload permission helper 차단"
    )
    await assertAsyncThrows(
      () => requireAttachmentEntityPermission("DEFECT_RECORD", "DELETE", fixtureA!.currentUser),
      "T36. DEFECT_MANAGEMENT DELETE false이면 delete permission helper 차단"
    )
    for (const action of ["CREATE", "DELETE"] as PermissionAction[]) {
      await prisma.rolePermission.update({
        where: { tenantId_role_resource_action: { tenantId: fixtureA.tenantId, role: "MANAGER", resource: "DEFECT_MANAGEMENT", action } },
        data: { isAllowed: true },
      })
    }
    await requireAttachmentEntityPermission("DEFECT_RECORD", "CREATE", fixtureA.currentUser)
    await requireAttachmentEntityPermission("DEFECT_RECORD", "DELETE", fixtureA.currentUser)
    passed += 2

    await recordAttachmentStorageCleanupFailure({
      tenantId: fixtureA.tenantId,
      actor: fixtureA.currentUser,
      attachment: { id: repairAttachment.id, storagePath: repairAttachment.storagePath, fileName: repairAttachment.fileName },
      error: "fixture storage failure",
    })
    const cleanupAudit = await prisma.auditLog.count({ where: { tenantId: fixtureA.tenantId, entityType: "AttachmentStorageCleanup", entityId: repairAttachment.id } })
    assertEqual(cleanupAudit, 1, "T37. storage cleanup failure helper records durable AuditLog when possible")
    await recordAttachmentStorageCleanupFailure({
      tenantId: fixtureA.tenantId,
      actor: fixtureA.currentUser,
      attachment: { id: `${prefix}-audit-fail`, storagePath: "fixture/missing.pdf", fileName: "missing.pdf" },
      error: "fixture storage failure",
      auditLogCreate: async () => {
        throw new Error("forced audit failure")
      },
    })
    passed++
  } finally {
    await cleanupFixture(prefix)
    const remainingTenants = await prisma.tenant.count({ where: { id: { in: [`${prefix}-tenant-a`, `${prefix}-tenant-b`] } } })
    assertEqual(remainingTenants, 0, "T38. F20 fixture tenant cleanup 0건")
  }
}

async function main() {
  try {
    await runActualDbChecks()
  } finally {
    await prisma.$disconnect()
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch(async (error) => {
  failed++
  console.error(error)
  try {
    await prisma.$disconnect()
  } finally {
    console.log(`\n${passed} passed, ${failed} failed`)
    process.exit(1)
  }
})
