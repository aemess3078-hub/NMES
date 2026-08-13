// EquipmentEvent 고아(미해제) 이벤트 진단 — 읽기 전용
//
// 실행: npx ts-node --project tsconfig.json scripts/diagnose-equipment-events.ts
// DB 접속은 .env.deploy 또는 환경변수 DATABASE_URL 을 사용한다.
// 이 스크립트는 SELECT만 수행하며, 어떤 데이터도 변경하지 않는다.
//
// 진단 항목
//   1. 특정 설비/기간의 이벤트 원본 (기본: 자동선반-6, 2026-07-28 02:00~02:30 KST)
//   2. 현재 열려 있는(endedAt IS NULL) 모든 이벤트
//   3. 같은 설비 + 같은 startedAt 으로 2건 이상 존재하는 중복 이벤트
//   4. 고아 이벤트 = 열려 있지만 그 뒤에 다른 이벤트가 존재하는 이벤트
//      (설비가 이미 다음 상태로 넘어갔으므로 닫혔어야 하는 이벤트)

import fs from "fs"
import path from "path"
import { PrismaClient } from "@prisma/client"

const ROOT = process.cwd()
const ENV_FILE = path.join(ROOT, ".env.deploy")

function loadEnvDeploy() {
  if (!fs.existsSync(ENV_FILE)) return

  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue

    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] ??= value
  }
}

loadEnvDeploy()

const prisma = new PrismaClient()

// ─── 조회 대상 (인자로 덮어쓰기 가능) ────────────────────────────────────────
// npx ts-node ... scripts/diagnose-equipment-events.ts CNC-6 2026-07-28T02:00 2026-07-28T02:30
const [argEquipmentCode, argFrom, argTo] = process.argv.slice(2)
const FOCUS_EQUIPMENT_CODE = argEquipmentCode ?? "CNC-6"
const FOCUS_FROM = kstToUtc(argFrom ?? "2026-07-28T02:00")
const FOCUS_TO = kstToUtc(argTo ?? "2026-07-28T02:30")

// 화면(에러보기)이 KST로 표기하므로 입력/출력 모두 KST 기준으로 맞춘다.
function kstToUtc(local: string): Date {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) throw new Error(`시각 형식 오류(YYYY-MM-DDTHH:mm): ${local}`)
  const [, y, mo, d, h, mi, s = "0"] = m
  return new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h) - 9, Number(mi), Number(s))
  )
}

function kst(date: Date | null): string {
  if (!date) return "NULL(발생중)"
  return new Date(date.getTime() + 9 * 3600_000)
    .toISOString()
    .replace("T", " ")
    .replace("Z", " KST")
}

function section(title: string) {
  console.log(`\n${"═".repeat(78)}\n${title}\n${"═".repeat(78)}`)
}

async function main() {
  // ── 1. 지목된 설비/기간의 이벤트 원본 ──────────────────────────────────────
  section(
    `1. ${FOCUS_EQUIPMENT_CODE} / ${kst(FOCUS_FROM)} ~ ${kst(FOCUS_TO)} 이벤트 원본`
  )

  const focusEquipments = await prisma.equipment.findMany({
    where:  { code: FOCUS_EQUIPMENT_CODE },
    select: { id: true, code: true, name: true, tenantId: true },
  })

  if (focusEquipments.length === 0) {
    console.log(`설비 코드 ${FOCUS_EQUIPMENT_CODE} 를 찾을 수 없습니다.`)
  }

  for (const eq of focusEquipments) {
    const events = await prisma.equipmentEvent.findMany({
      where:   { equipmentId: eq.id, startedAt: { gte: FOCUS_FROM, lte: FOCUS_TO } },
      orderBy: { startedAt: "asc" },
      select:  {
        id: true,
        eventType: true,
        message: true,
        startedAt: true,
        endedAt: true,
        duration: true,
      },
    })

    console.log(`\n[${eq.code}] ${eq.name} (equipmentId=${eq.id})  이벤트 ${events.length}건`)
    for (const ev of events) {
      console.log(
        [
          `  id=${ev.id}`,
          `type=${ev.eventType}`,
          `startedAt=${kst(ev.startedAt)}`,
          `endedAt=${kst(ev.endedAt)}`,
          `duration=${ev.duration ?? "NULL"}`,
          `message=${ev.message ?? "NULL"}`,
        ].join("  ")
      )
    }

    // 같은 (eventType, startedAt, message) 조합이 2건 이상인지 = 중복 생성 여부
    const groups: Record<string, typeof events> = {}
    for (const ev of events) {
      const key = `${ev.eventType}|${ev.startedAt.toISOString()}|${ev.message ?? ""}`
      groups[key] = [...(groups[key] ?? []), ev]
    }
    for (const key of Object.keys(groups)) {
      const rows = groups[key]
      if (rows.length < 2) continue
      console.log(
        `  ⚠ 중복 ${rows.length}건 → ${key}\n` +
          rows
            .map(
              (r) =>
                `      id=${r.id} endedAt=${kst(r.endedAt)} duration=${r.duration ?? "NULL"}`
            )
            .join("\n")
      )
    }
  }

  // ── 2. 현재 열려 있는 모든 이벤트 ──────────────────────────────────────────
  section("2. 현재 열려 있는(endedAt IS NULL) 전체 이벤트")

  const openEvents = await prisma.equipmentEvent.findMany({
    where:   { endedAt: null },
    orderBy: { startedAt: "asc" },
    select:  {
      id: true,
      eventType: true,
      message: true,
      startedAt: true,
      equipment: { select: { code: true, name: true, tenantId: true } },
    },
  })

  console.log(`총 ${openEvents.length}건`)
  const now = Date.now()
  for (const ev of openEvents) {
    const ageH = ((now - ev.startedAt.getTime()) / 3600_000).toFixed(1)
    console.log(
      `  [${ev.equipment.code}] ${ev.eventType.padEnd(11)} startedAt=${kst(ev.startedAt)}  경과=${ageH}h  id=${ev.id}  msg=${ev.message ?? "NULL"}`
    )
  }

  // ── 3. 같은 설비 + 같은 startedAt 중복 ────────────────────────────────────
  section("3. 같은 설비 + 같은 startedAt 으로 2건 이상 존재하는 이벤트")

  const dupes = await prisma.$queryRaw<
    Array<{
      equipmentCode: string
      eventType:     string
      startedAt:     Date
      cnt:           bigint
      openCnt:       bigint
      ids:           string
    }>
  >`
    SELECT eq."code"                                        AS "equipmentCode",
           e."eventType"::text                              AS "eventType",
           e."startedAt"                                    AS "startedAt",
           COUNT(*)                                         AS "cnt",
           COUNT(*) FILTER (WHERE e."endedAt" IS NULL)      AS "openCnt",
           string_agg(e."id", ', ' ORDER BY e."id")         AS "ids"
    FROM "EquipmentEvent" e
    JOIN "Equipment" eq ON eq."id" = e."equipmentId"
    GROUP BY eq."code", e."eventType", e."startedAt"
    HAVING COUNT(*) > 1
    ORDER BY e."startedAt" DESC
    LIMIT 200
  `

  console.log(`총 ${dupes.length}그룹 (최대 200)`)
  for (const d of dupes) {
    console.log(
      `  [${d.equipmentCode}] ${d.eventType} startedAt=${kst(d.startedAt)} 건수=${d.cnt} 미해제=${d.openCnt}\n      ids=${d.ids}`
    )
  }

  // ── 4. 고아 이벤트 (열려 있으나 뒤에 다른 이벤트가 존재) ───────────────────
  section("4. 고아 이벤트 — 열려 있지만 그 뒤에 다른 이벤트가 존재 (닫혔어야 함)")

  const orphans = await prisma.$queryRaw<
    Array<{
      id:            string
      equipmentCode: string
      eventType:     string
      message:       string | null
      startedAt:     Date
      suggestedEnd:  Date
      suggestedFrom: string
    }>
  >`
    WITH ranked AS (
      SELECT e."id",
             e."equipmentId",
             e."eventType",
             e."message",
             e."startedAt",
             e."endedAt",
             ROW_NUMBER() OVER (
               PARTITION BY e."equipmentId"
               ORDER BY e."startedAt" DESC, e."id" DESC
             ) AS rn
      FROM "EquipmentEvent" e
    )
    SELECT o."id",
           eq."code"           AS "equipmentCode",
           o."eventType"::text AS "eventType",
           o."message",
           o."startedAt",
           COALESCE(twin."endedAt", nxt."startedAt", o."startedAt") AS "suggestedEnd",
           CASE
             WHEN twin."endedAt"  IS NOT NULL THEN 'twin(동일 startedAt의 닫힌 이벤트)'
             WHEN nxt."startedAt" IS NOT NULL THEN 'next(다음 이벤트 시작시각)'
             ELSE 'self(startedAt — duration 0)'
           END AS "suggestedFrom"
    FROM ranked o
    JOIN "Equipment" eq ON eq."id" = o."equipmentId"
    LEFT JOIN LATERAL (
      SELECT MIN(t."endedAt") AS "endedAt"
      FROM "EquipmentEvent" t
      WHERE t."equipmentId" = o."equipmentId"
        AND t."eventType"   = o."eventType"
        AND t."startedAt"   = o."startedAt"
        AND t."id"         <> o."id"
        AND t."endedAt"    IS NOT NULL
    ) twin ON TRUE
    LEFT JOIN LATERAL (
      SELECT MIN(n."startedAt") AS "startedAt"
      FROM "EquipmentEvent" n
      WHERE n."equipmentId" = o."equipmentId"
        AND (n."startedAt", n."id") > (o."startedAt", o."id")
    ) nxt ON TRUE
    WHERE o."endedAt" IS NULL
      AND o.rn > 1
    ORDER BY o."startedAt" DESC
  `

  console.log(`총 ${orphans.length}건`)
  for (const o of orphans) {
    const dur = Math.max(
      0,
      Math.round((o.suggestedEnd.getTime() - o.startedAt.getTime()) / 1000)
    )
    console.log(
      `  [${o.equipmentCode}] ${o.eventType} startedAt=${kst(o.startedAt)} id=${o.id}\n` +
        `      msg=${o.message ?? "NULL"}\n` +
        `      제안 endedAt=${kst(o.suggestedEnd)} (${o.suggestedFrom}) duration=${dur}s`
    )
  }

  section("요약")
  console.log(`열린 이벤트           : ${openEvents.length}건`)
  console.log(`중복 (설비+시작시각)  : ${dupes.length}그룹`)
  console.log(`고아(닫혀야 할) 이벤트: ${orphans.length}건`)
  console.log(
    `\n※ 이 스크립트는 SELECT만 수행했습니다. 정정은 별도 마이그레이션 승인 후 진행하십시오.`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
