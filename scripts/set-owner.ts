/**
 * 1@1.com 계정을 OWNER로 설정하는 초기화 스크립트
 * 실행: npx tsx scripts/set-owner.ts
 */

import { createClient } from "@supabase/supabase-js"
import { PrismaClient } from "@prisma/client"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("✗ .env.local에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY가 필요합니다.")
  process.exit(1)
}
const TENANT_ID = "tenant-demo-001"
const TARGET_EMAIL = "1@1.com"

const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const prisma = new PrismaClient()

async function main() {
  console.log(`\n[1] Supabase에서 ${TARGET_EMAIL} 조회 중...`)

  const { data: authData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 200 })
  if (listError) throw new Error(`Supabase listUsers 실패: ${listError.message}`)

  const authUser = authData.users.find((u) => u.email === TARGET_EMAIL)
  if (!authUser) {
    console.error(`✗ Supabase에 ${TARGET_EMAIL} 계정이 없습니다.`)
    console.error("  먼저 Supabase Auth에서 계정을 생성하세요.")
    process.exit(1)
  }

  const authUserId = authUser.id
  console.log(`✓ 발견: ${authUser.email} (${authUserId})`)

  // 2. Profile upsert
  console.log("\n[2] Profile 생성/업데이트 중...")
  await prisma.profile.upsert({
    where: { id: authUserId },
    create: {
      id: authUserId,
      email: TARGET_EMAIL,
      name: authUser.user_metadata?.name ?? "마스터",
    },
    update: {
      email: TARGET_EMAIL,
      name: authUser.user_metadata?.name ?? "마스터",
    },
  })
  console.log("✓ Profile 완료")

  // 3. Tenant 존재 확인
  console.log("\n[3] Tenant 확인 중...")
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID } })
  if (!tenant) {
    console.error(`✗ Tenant '${TENANT_ID}'가 DB에 없습니다. 먼저 seed를 실행하세요:`)
    console.error("  npx tsx prisma/seed.ts")
    process.exit(1)
  }
  console.log(`✓ Tenant: ${tenant.name}`)

  // 4. TenantUser upsert (OWNER)
  console.log("\n[4] TenantUser OWNER 설정 중...")
  const existing = await prisma.tenantUser.findFirst({
    where: { tenantId: TENANT_ID, profileId: authUserId },
  })

  if (existing) {
    await prisma.tenantUser.update({
      where: { id: existing.id },
      data: { role: "OWNER", isActive: true },
    })
    console.log(`✓ 기존 TenantUser 업데이트 → OWNER`)
  } else {
    await prisma.tenantUser.create({
      data: {
        tenantId: TENANT_ID,
        profileId: authUserId,
        role: "OWNER",
        isActive: true,
      },
    })
    console.log(`✓ TenantUser 신규 생성 → OWNER`)
  }

  console.log(`\n✅ 완료! ${TARGET_EMAIL} 계정이 OWNER로 설정되었습니다.`)
  console.log(`   로그인 후 /app/mes/users 에서 확인하세요.\n`)
}

main()
  .catch((e) => { console.error("\n✗ 오류:", e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
