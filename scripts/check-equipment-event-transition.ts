// EquipmentEvent 상태 전이 판정 시나리오 검증 (DB 불필요)
//
// 실행:
//   npx ts-node --compiler-options '{"module":"commonjs"}' \
//     scripts/check-equipment-event-transition.ts
//
// syncEquipmentEvent()의 판정부(planEquipmentEventTransition)를 시나리오별로 검증한다.
// DB 왕복 없이 "무엇을 닫고 무엇을 새로 만드는지"만 확인하므로 CI에서도 그대로 돌릴 수 있다.

import {
  planEquipmentEventTransition,
  type OpenEquipmentEvent,
} from "../src/lib/ncwatch/equipment-event-plan"

function openEvent(
  id: string,
  eventType: string,
  startedAt: string
): OpenEquipmentEvent {
  return { id, eventType, startedAt: new Date(startedAt) }
}

let failed = 0

function expect(
  scenario: string,
  actual: { closeIds: string[]; createNew: boolean },
  expected: { closeIds: string[]; createNew: boolean }
) {
  const ok =
    actual.createNew === expected.createNew &&
    actual.closeIds.length === expected.closeIds.length &&
    actual.closeIds.every((id, i) => id === expected.closeIds[i])

  console.log(
    `${ok ? "PASS" : "FAIL"}  ${scenario}\n` +
      `        expected closeIds=[${expected.closeIds}] createNew=${expected.createNew}\n` +
      `        actual   closeIds=[${actual.closeIds}] createNew=${actual.createNew}`
  )
  if (!ok) failed += 1
}

// ── Scenario 1: 정상적인 1회 알람 (RUN → ALARM → RUN) ────────────────────────
expect(
  "S1-a RUN 중 ALARM 수신 → RUN 이벤트 닫고 ALARM 신규 생성",
  planEquipmentEventTransition([openEvent("run1", "RUN", "2026-07-28T02:00:00Z")], "ALARM"),
  { closeIds: ["run1"], createNew: true }
)
expect(
  "S1-b ALARM 중 RUN 복귀 → ALARM 이벤트 닫고 RUN 신규 생성",
  planEquipmentEventTransition([openEvent("alarm1", "ALARM", "2026-07-28T02:07:35Z")], "RUN"),
  { closeIds: ["alarm1"], createNew: true }
)

// ── Scenario 2: 동일 ALARM payload 재전송 ───────────────────────────────────
// 이미 같은 상태가 열려 있으면 새 이벤트를 만들지 않는다 (중복 생성 차단).
expect(
  "S2 ALARM 열린 상태에서 동일 ALARM 재수신 → 아무것도 만들지/닫지 않음",
  planEquipmentEventTransition([openEvent("alarm1", "ALARM", "2026-07-28T02:07:35Z")], "ALARM"),
  { closeIds: [], createNew: false }
)

// ── Scenario 3: 동시 요청으로 이미 중복 생성된 상태 ─────────────────────────
// 락 안에서 다시 판정하면, 가장 먼저 열린 1건만 남기고 나머지 중복은 닫는다.
expect(
  "S3 같은 ALARM이 2건 열려 있고 ALARM 재수신 → 늦게 열린 중복만 닫음",
  planEquipmentEventTransition(
    [
      openEvent("alarmA", "ALARM", "2026-07-28T02:07:35Z"),
      openEvent("alarmB", "ALARM", "2026-07-28T02:07:35Z"),
    ],
    "ALARM"
  ),
  { closeIds: ["alarmB"], createNew: false }
)

// ── Scenario 4: 과거에 쌓인 고아 이벤트가 있는 상태에서 정상 복귀 ───────────
// findFirst 시절에는 1건만 닫혔다. 이제 열린 이벤트를 전부 닫는다.
expect(
  "S4 고아 ALARM 2건이 열린 상태에서 RUN 복귀 → 2건 모두 닫고 RUN 생성",
  planEquipmentEventTransition(
    [
      openEvent("alarmA", "ALARM", "2026-07-28T02:07:35Z"),
      openEvent("alarmB", "ALARM", "2026-07-28T02:07:35Z"),
    ],
    "RUN"
  ),
  { closeIds: ["alarmA", "alarmB"], createNew: true }
)

// ── Scenario 5: 서로 다른 eventType이 동시에 열려 있는 경우 ─────────────────
// 이 시스템은 설비당 열린 이벤트 1건 설계이므로, 다른 타입이 남아 있으면 그것도 고아다.
// 단, 새로 들어온 상태와 같은 타입은 유지되어야 한다(= 그 이벤트가 잘못 닫히지 않는다).
expect(
  "S5-a STOP 고아 + ALARM 열림 상태에서 ALARM 재수신 → STOP만 닫고 ALARM 유지",
  planEquipmentEventTransition(
    [
      openEvent("stop1", "STOP", "2026-07-28T01:50:00Z"),
      openEvent("alarm1", "ALARM", "2026-07-28T02:07:35Z"),
    ],
    "ALARM"
  ),
  { closeIds: ["stop1"], createNew: false }
)
expect(
  "S5-b STOP 고아 + ALARM 열림 상태에서 RUN 복귀 → 둘 다 닫고 RUN 생성",
  planEquipmentEventTransition(
    [
      openEvent("stop1", "STOP", "2026-07-28T01:50:00Z"),
      openEvent("alarm1", "ALARM", "2026-07-28T02:07:35Z"),
    ],
    "RUN"
  ),
  { closeIds: ["stop1", "alarm1"], createNew: true }
)

// ── Scenario 6: 열린 이벤트가 하나도 없는 최초 수신 ─────────────────────────
expect(
  "S6 열린 이벤트 없음 → 신규 생성만",
  planEquipmentEventTransition([], "RUN"),
  { closeIds: [], createNew: true }
)

console.log(`\n${failed === 0 ? "모든 시나리오 통과" : `${failed}건 실패`}`)
process.exit(failed === 0 ? 0 : 1)
