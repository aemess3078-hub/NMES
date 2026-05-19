/**
 * 기존 Profile/TenantUser 계정에 UserCredential이 없는 경우 생성하는 마이그레이션 스크립트
 *
 * 사용법:
 *   dry-run (기본):  npx ts-node --project tsconfig.json scripts/migrate-user-credentials.ts
 *   실제 적용:        npx ts-node --project tsconfig.json scripts/migrate-user-credentials.ts --apply
 *
 * package.json 스크립트:
 *   npm run migrate:user-credentials           → dry-run
 *   npm run migrate:user-credentials -- --apply → 실제 생성
 */

import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()
const isDryRun = !process.argv.includes("--apply")
const SALT_ROUNDS = 12

function normalizeLoginId(loginId: string): string {
  return loginId.trim().toLowerCase()
}

function generateTempPassword(): string {
  const lower = Math.random().toString(36).slice(2, 6)
  const upper = Math.random().toString(36).slice(2, 6).toUpperCase()
  const digits = Math.floor(Math.random() * 90 + 10).toString()
  const special = "!@#$%"[Math.floor(Math.random() * 5)]
  const raw = lower + upper + digits + special
  return raw.split("").sort(() => Math.random() - 0.5).join("")
}

async function generateUniqueLoginId(
  base: string,
  tenantId: string,
  reserved: Set<string>,
): Promise<string> {
  const normalizedBase = normalizeLoginId(base)
  let candidate = normalizedBase
  let n = 2
  while (
    reserved.has(`${tenantId}:${candidate}`) ||
    (await prisma.userCredential.findUnique({
      where: { tenantId_loginId: { tenantId, loginId: candidate } },
    }))
  ) {
    candidate = `${normalizedBase}${n}`
    n++
  }
  reserved.add(`${tenantId}:${candidate}`)
  return candidate
}

interface PlanRow {
  profileId: string
  name: string
  email: string
  tenantId: string
  loginId: string
  tempPassword: string
}

async function main() {
  const mode = isDryRun ? "DRY-RUN (미리보기)" : "APPLY (실제 생성)"
  console.log(`\n====== UserCredential 마이그레이션 [${mode}] ======\n`)

  const profiles = await prisma.profile.findMany({
    include: {
      tenantUsers: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      userCredential: true,
    },
    orderBy: { createdAt: "asc" },
  })

  const plan: PlanRow[] = []
  let skipCount = 0
  const reserved = new Set<string>()

  for (const profile of profiles) {
    if (profile.userCredential) {
      console.log(`  ⏭  SKIP  ${profile.email || profile.id}  — 이미 UserCredential 있음`)
      skipCount++
      continue
    }

    if (profile.tenantUsers.length === 0) {
      console.log(`  ⏭  SKIP  ${profile.email || profile.id}  — 활성 TenantUser 없음`)
      skipCount++
      continue
    }

    const tenantId = profile.tenantUsers[0].tenantId

    if (profile.tenantUsers.length > 1) {
      const tenantIds = profile.tenantUsers.map((u) => u.tenantId).join(", ")
      console.log(
        `  ⚠  WARN  ${profile.email || profile.id}  — 다중 테넌트 발견 (${tenantIds}), 첫 번째 테넌트(${tenantId}) 기준으로 생성`,
      )
    }

    const rawBase = profile.email
      ? profile.email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "")
      : `user${profile.id.slice(0, 8)}`
    const base = normalizeLoginId(rawBase || `user${profile.id.slice(0, 8)}`)

    const loginId = await generateUniqueLoginId(base, tenantId, reserved)
    const tempPassword = generateTempPassword()

    plan.push({ profileId: profile.id, name: profile.name, email: profile.email, tenantId, loginId, tempPassword })
  }

  if (plan.length === 0) {
    console.log(`\n생성 대상 없음. 스킵: ${skipCount}건\n`)
    return
  }

  console.log(`\n─── 생성 ${isDryRun ? "예정" : "결과"} (${plan.length}건) ${"─".repeat(40)}`)
  console.log(`  ${"이름".padEnd(12)} ${"이메일".padEnd(32)} ${"loginId".padEnd(20)} 임시 비밀번호`)
  console.log(`  ${"─".repeat(90)}`)

  if (isDryRun) {
    for (const r of plan) {
      console.log(`  ${r.name.padEnd(12)} ${r.email.padEnd(32)} ${r.loginId.padEnd(20)} ${r.tempPassword}`)
    }
    console.log(`\n[DRY-RUN] 생성 예정: ${plan.length}건  스킵: ${skipCount}건`)
    console.log("실제 적용하려면 --apply 옵션을 추가하세요:")
    console.log("  npm run migrate:user-credentials -- --apply\n")
    return
  }

  // ─── APPLY ────────────────────────────────────────────────────────────────
  let createdCount = 0
  let errorCount = 0

  for (const r of plan) {
    try {
      const passwordHash = await bcrypt.hash(r.tempPassword, SALT_ROUNDS)
      await prisma.userCredential.create({
        data: {
          tenantId: r.tenantId,
          loginId: r.loginId,
          profileId: r.profileId,
          passwordHash,
          mustChangePw: true,
          isLocked: false,
          failCount: 0,
        },
      })
      console.log(`  ${r.name.padEnd(12)} ${r.email.padEnd(32)} ${r.loginId.padEnd(20)} ${r.tempPassword}`)
      createdCount++
    } catch (e) {
      console.error(`  ✗ 오류  ${r.name} (${r.email}): ${e instanceof Error ? e.message : String(e)}`)
      errorCount++
    }
  }

  console.log(`\n✅ 완료  생성: ${createdCount}건  스킵: ${skipCount}건  오류: ${errorCount}건`)
  if (createdCount > 0) {
    console.log("⚠  위 임시 비밀번호는 다시 확인할 수 없습니다. 지금 기록해 두세요.")
    console.log("   사용자는 최초 로그인 후 비밀번호 변경을 해야 합니다. (mustChangePw=true)\n")
  }
}

main()
  .catch((e) => {
    console.error("\n✗ 오류:", e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
