// EquipmentEvent 상태 전이 판정 (순수 함수 — DB/Prisma 의존성 없음)
//
// 이 시스템에서 EquipmentEvent를 생성하는 경로는 syncEquipmentEvent() 하나뿐이고,
// 상태가 바뀔 때마다 "열린 이벤트를 닫고 → 새 이벤트를 연다"로 동작한다.
// 따라서 설비 1대에 열려 있는(endedAt IS NULL) 이벤트는 항상 최대 1건이어야 한다.
//
// 실제 운영에서는 다음 두 가지로 이 불변식이 깨질 수 있다.
//   1) 동일 payload 재전송/동시 요청으로 같은 상태의 이벤트가 2건 생성
//   2) 정상 복귀 시 열린 이벤트를 1건만 닫아서 나머지가 영구히 "발생중"으로 남음
// 아래 판정은 두 경우를 모두 흡수한다.

export type OpenEquipmentEvent = {
  id:        string
  eventType: string
  startedAt: Date
}

export type EquipmentEventPlan = {
  /** endedAt/duration을 채워서 닫아야 할 이벤트 id 목록 */
  closeIds:  string[]
  /** 새 EquipmentEvent를 생성해야 하는지 여부 */
  createNew: boolean
}

/**
 * 열린 이벤트 목록과 새로 감지된 상태를 받아 "무엇을 닫고 무엇을 만들지"를 판정한다.
 *
 * - 같은 eventType이 이미 열려 있으면 재전송/중복 수신으로 보고 새로 만들지 않는다.
 *   (가장 먼저 열린 1건을 유지해 실제 발생시각을 보존하고, 나머지 중복은 닫는다)
 * - 그 외 열려 있는 이벤트는 상태가 바뀐 것이므로 전부 닫는다.
 *   findFirst로 1건만 닫던 기존 동작과 달리, 이미 쌓인 고아 이벤트도 함께 회수된다.
 */
export function planEquipmentEventTransition(
  openEvents:   OpenEquipmentEvent[],
  newEventType: string
): EquipmentEventPlan {
  const sameType = openEvents.filter((e) => e.eventType === newEventType)

  const keep =
    sameType.length > 0
      ? sameType.reduce((earliest, e) =>
          e.startedAt.getTime() < earliest.startedAt.getTime() ? e : earliest
        )
      : null

  return {
    closeIds:  openEvents.filter((e) => e.id !== keep?.id).map((e) => e.id),
    createNew: keep === null,
  }
}
