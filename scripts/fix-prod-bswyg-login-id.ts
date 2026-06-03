/**
 * 운영 DB 보정 스크립트: 안복순 계정 loginId 수정
 *
 * 목적:
 *   UserCredential.loginId = 'bswyg@cnsmed.co.kr' → 'bswyg' 로 변경
 *   Profile.email은 bswyg@cnsmed.co.kr 그대로 유지
 *
 * 실행 방법 (운영 DATABASE_URL 환경변수 설정 후):
 *   npx ts-node --project tsconfig.json scripts/fix-prod-bswyg-login-id.ts
 *
 * 주의:
 *   - 이 스크립트는 1회성 보정용이다. 실행 전 반드시 DB 스냅샷을 확인할 것.
 *   - 비밀번호/해시는 변경하지 않는다.
 *   - 실행 후 bswyg 계정으로 로그인 테스트 필수.
 */

import { readFileSync } from "fs"
import { join } from "path"
import { PrismaClient } from "@prisma/client"

// 운영 DATABASE_URL 우선순위: process.env > .env.deploy
function resolveDbUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  try {
    const raw = readFileSync(join(process.cwd(), ".env.deploy"), "utf8")
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^DATABASE_URL=(.*)$/)
      if (m) return m[1].trim()
    }
  } catch {
    /* .env.deploy 없음 → 아래에서 에러 처리 */
  }
  throw new Error("DATABASE_URL을 찾을 수 없습니다 (process.env 또는 .env.deploy 필요).")
}

const prisma = new PrismaClient({ datasources: { db: { url: resolveDbUrl() } } })

const OLD_LOGIN_ID = "bswyg@cnsmed.co.kr"
const NEW_LOGIN_ID = "bswyg"

async function main() {
  console.log(`[fix-prod-bswyg-login-id] 시작`)
  console.log(`  변경 대상 loginId: ${OLD_LOGIN_ID} → ${NEW_LOGIN_ID}`)

  // 1. 대상 credential 조회
  const target = await prisma.userCredential.findFirst({
    where: { loginId: OLD_LOGIN_ID },
    select: {
      id: true,
      tenantId: true,
      loginId: true,
      profile: { select: { name: true, email: true } },
    },
  })

  if (!target) {
    console.error(`[오류] loginId='${OLD_LOGIN_ID}' 인 UserCredential을 찾지 못했습니다.`)
    console.error("       이미 변경되었거나 DB 연결을 확인하세요.")
    process.exit(1)
  }

  console.log(`  대상 계정: ${target.profile.name} (${target.profile.email})`)
  console.log(`  tenantId : ${target.tenantId}`)

  // 2. 중복 loginId 확인
  const duplicate = await prisma.userCredential.findFirst({
    where: {
      tenantId: target.tenantId,
      loginId: NEW_LOGIN_ID,
    },
    select: { id: true },
  })

  if (duplicate) {
    console.error(`[오류] loginId='${NEW_LOGIN_ID}' 가 이미 존재합니다. (id: ${duplicate.id})`)
    console.error("       중복 loginId로 변경할 수 없습니다. 수동 확인이 필요합니다.")
    process.exit(1)
  }

  // 3. loginId 변경
  await prisma.userCredential.update({
    where: { id: target.id },
    data: { loginId: NEW_LOGIN_ID },
  })

  console.log(`[완료] loginId 변경 성공: '${OLD_LOGIN_ID}' → '${NEW_LOGIN_ID}'`)
  console.log(`  - Profile.email 은 '${target.profile.email}' 로 유지됩니다.`)
  console.log(`  - 이제 '${NEW_LOGIN_ID}' 로 로그인 가능합니다.`)
}

main()
  .catch((e) => {
    console.error("[스크립트 오류]", e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
