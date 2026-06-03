/**
 * 운영 DB 보정: bswyg 계정 POP PIN 설정 (4514)
 *
 * 실행:
 *   npx ts-node --transpile-only --compiler-options '{"module":"commonjs","moduleResolution":"node"}' scripts/set-pop-pin-bswyg.ts
 *
 * 주의:
 *   - PIN은 평문 저장되지 않습니다 (bcrypt hash + HMAC fingerprint).
 *   - 같은 tenant 내 PIN 중복 여부를 사전 확인합니다.
 *   - secret 원문을 절대 출력하지 않습니다.
 */
import { readFileSync } from "fs"
import { join } from "path"
import { createHmac } from "crypto"
import bcrypt from "bcryptjs"
import { PrismaClient } from "@prisma/client"

function readEnvDeploy(): Record<string, string> {
  const raw = readFileSync(join(process.cwd(), ".env.deploy"), "utf8")
  const map: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) map[m[1]] = m[2].trim()
  }
  return map
}

const env = readEnvDeploy()
const DATABASE_URL = env.DATABASE_URL
const POP_PIN_SECRET = env.POP_PIN_SECRET

if (!DATABASE_URL) throw new Error("DATABASE_URL not found in .env.deploy")
if (!POP_PIN_SECRET) throw new Error("POP_PIN_SECRET not found in .env.deploy")

const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } })

const TENANT_ID = "cns-medical"
const LOGIN_ID = "bswyg"
const PIN = "4514"

function createFingerprint(tenantId: string, pin: string): string {
  return createHmac("sha256", POP_PIN_SECRET)
    .update(`${tenantId}:${pin}`)
    .digest("hex")
}

async function main() {
  console.log(`[set-pop-pin] 대상: ${LOGIN_ID} / tenant: ${TENANT_ID}`)
  console.log(`[set-pop-pin] PIN: ****  (4자리, 비공개)`)

  // 1. 대상 credential 조회
  const credential = await prisma.userCredential.findUnique({
    where: { tenantId_loginId: { tenantId: TENANT_ID, loginId: LOGIN_ID } },
    select: { id: true, popPinFingerprint: true, profile: { select: { name: true } } },
  })
  if (!credential) {
    console.error(`[오류] loginId='${LOGIN_ID}' credential을 찾지 못했습니다.`)
    process.exit(1)
  }
  console.log(`[확인] 대상 계정: ${credential.profile.name}`)

  // 2. fingerprint 생성 (PIN 원문은 이 이후로 로그에 출력 안 함)
  const newFingerprint = createFingerprint(TENANT_ID, PIN)

  // 3. 기존 PIN과 동일한지 확인
  if (credential.popPinFingerprint === newFingerprint) {
    console.log(`[완료] 이미 동일한 POP PIN이 설정되어 있습니다. 변경하지 않습니다.`)
    return
  }

  // 4. 같은 tenant 내 fingerprint 중복 확인
  const dup = await prisma.userCredential.findFirst({
    where: { tenantId: TENANT_ID, popPinFingerprint: newFingerprint, id: { not: credential.id } },
    select: { id: true },
  })
  if (dup) {
    console.error(`[오류] 같은 tenant 내에 이미 동일한 POP PIN을 사용하는 계정이 있습니다.`)
    process.exit(1)
  }

  // 5. PIN hash 생성 (bcrypt 12 rounds)
  const popPinHash = await bcrypt.hash(PIN, 12)

  // 6. UserCredential 업데이트
  await prisma.userCredential.update({
    where: { id: credential.id },
    data: {
      popPinHash,
      popPinFingerprint: newFingerprint,
      popPinSetAt: new Date(),
    },
  })

  console.log(`[완료] POP PIN 설정 성공.`)
  console.log(`  - 계정: ${credential.profile.name} (${LOGIN_ID})`)
  console.log(`  - hash: [bcrypt, 비공개]`)
  console.log(`  - fingerprint: ${newFingerprint.slice(0, 8)}... (앞 8자리만 표시)`)
  console.log(`  - 작업자모드 로그인 시 4자리 PIN으로 로그인 가능합니다.`)
}

main()
  .catch((e) => { console.error("[스크립트 오류]", e); process.exit(1) })
  .finally(() => prisma.$disconnect())
