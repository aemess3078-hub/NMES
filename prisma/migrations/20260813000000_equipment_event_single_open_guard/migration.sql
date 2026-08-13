-- EquipmentEvent: 설비당 "열린 이벤트(endedAt IS NULL)" 1건 불변식 강제
--
-- 배경
--   EquipmentEvent 생성 경로는 syncEquipmentEvent() 하나뿐이며, 상태가 바뀔 때마다
--   열린 이벤트를 닫고 새 이벤트를 연다. 즉 설비당 열린 이벤트는 항상 최대 1건이어야 한다.
--   그러나 (a) 동일 payload 동시/재전송 시 이벤트가 중복 생성될 수 있었고,
--          (b) 정상 복귀 시 findFirst로 1건만 닫아 나머지가 영구히 "발생중"으로 남았다.
--   그 결과 에러보기 화면에 이미 해제된 알람이 미해제로 표시된다.
--
-- 이 마이그레이션은 단일 트랜잭션에서
--   1) 고아 이벤트를 닫고  2) 부분 유니크 인덱스를 생성한다.
--   (순서가 반대면 기존 데이터 때문에 인덱스 생성이 실패한다)

-- ── 1. 고아 이벤트 정리 ──────────────────────────────────────────────────────
-- 고아 = 열려 있으나 같은 설비의 "마지막 이벤트"가 아닌 것.
--        설비가 이미 다음 상태로 넘어갔으므로 그때 닫혔어야 한다.
-- 종료 시각 우선순위
--   1) twin : 같은 설비/타입/startedAt 을 가진 닫힌 이벤트의 endedAt (중복 생성된 짝)
--   2) next : 그 다음 이벤트의 startedAt (상태가 넘어간 시점)
--   3) self : 위 둘 다 없으면 자기 startedAt (duration 0)
WITH ranked AS (
    SELECT e."id",
           e."equipmentId",
           e."eventType",
           e."startedAt",
           e."endedAt",
           ROW_NUMBER() OVER (
               PARTITION BY e."equipmentId"
               ORDER BY e."startedAt" DESC, e."id" DESC
           ) AS rn
    FROM "EquipmentEvent" e
),
orphans AS (
    SELECT o."id",
           o."startedAt",
           COALESCE(twin."endedAt", nxt."startedAt", o."startedAt") AS "closedAt"
    FROM ranked o
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
)
UPDATE "EquipmentEvent" e
SET "endedAt"  = o."closedAt",
    "duration" = GREATEST(
        0,
        ROUND(EXTRACT(EPOCH FROM (o."closedAt" - e."startedAt")))
    )::int
FROM orphans o
WHERE e."id" = o."id";

-- ── 2. 부분 유니크 인덱스 ────────────────────────────────────────────────────
-- Prisma schema로는 partial unique index를 표현할 수 없어 raw SQL로 관리한다.
-- (schema.prisma 의 EquipmentEvent 모델 주석 참고)
CREATE UNIQUE INDEX IF NOT EXISTS "EquipmentEvent_equipmentId_open_key"
    ON "EquipmentEvent" ("equipmentId")
    WHERE "endedAt" IS NULL;
