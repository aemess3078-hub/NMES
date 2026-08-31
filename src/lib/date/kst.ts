// ─── KST(Asia/Seoul) 달력일 변환 공용 helper ─────────────────────────────────
//
// 프로젝트에 date-fns-tz 등 timezone 라이브러리가 없고(package.json 확인),
// 기존 daily-production.actions.ts가 이미 검증해 쓰고 있는
// "UTC milliseconds + 9시간 → toISOString().slice(0,10)" 방식을 그대로 따른다.
// (equipment-statistics.actions.ts의 순수 UTC toISOString() 방식은 KST 00~09시
//  실적이 전날로 밀리는 버그가 있어 재사용하지 않는다.)
//
// 한국은 DST가 없는 고정 UTC+9 지역이므로, 하루(24h) 단위 millisecond 증가가
// 항상 정확히 다음 KST 달력일과 대응한다 — 이 파일의 날짜 순회가 안전한 이유.
//
// 이 파일은 production-progress 관련 3곳 이상에서 동일한 KST 오프셋 로직이
// 중복되는 것을 막기 위한 최소 공용 helper다. 기존 파일들(daily-production.actions.ts,
// production-progress/page.tsx, production-summary.tsx 등)의 로컬 구현을 이번
// 단계에서 이 helper로 일괄 교체하는 리팩터링은 하지 않는다 — 그 파일들은
// 변경 대상이 아니다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const ONE_DAY_MS = 24 * 60 * 60 * 1000

/** UTC 저장값(Date) → KST 달력일 문자열(YYYY-MM-DD) */
export function toKstDateKey(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

/** KST 달력일 문자열(YYYY-MM-DD) → 그 날짜 KST 00:00:00에 해당하는 UTC Date instant */
export function kstDateKeyToUtcStart(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00+09:00`)
}

/** from~to(둘 다 KST 달력일, inclusive) 사이의 모든 날짜 키를 오름차순으로 생성한다. */
export function buildKstDateKeyRange(fromKey: string, toKey: string): string[] {
  const keys: string[] = []
  let cursor = kstDateKeyToUtcStart(fromKey)
  const end = kstDateKeyToUtcStart(toKey)
  while (cursor.getTime() <= end.getTime()) {
    keys.push(toKstDateKey(cursor))
    cursor = new Date(cursor.getTime() + ONE_DAY_MS)
  }
  return keys
}

/** 대상일까지 남은 KST 달력일 수(오늘 = 0, 지남 = 음수). DB에 저장하지 않고 표시 시점에 계산한다. */
export function kstDaysUntil(target: Date, now: Date = new Date()): number {
  const targetStart = kstDateKeyToUtcStart(toKstDateKey(target))
  const nowStart = kstDateKeyToUtcStart(toKstDateKey(now))
  return Math.round((targetStart.getTime() - nowStart.getTime()) / ONE_DAY_MS)
}

/** D-Day 표시 문자열(D-10 / D-3 / D-Day / D+2). */
export function formatDDay(target: Date, now: Date = new Date()): string {
  const diff = kstDaysUntil(target, now)
  if (diff === 0) return "D-Day"
  return diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`
}
