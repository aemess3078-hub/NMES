import type { Prisma, Lot } from "@prisma/client"

// ─── 완제품 LOT 발번 / 조회 헬퍼 ─────────────────────────────────────────────
//
// createFinishedGoodsReceiptAction 트랜잭션 내부에서만 호출되는 헬퍼.
// 직접 호출되는 Server Action이 아니므로 "use server" 미사용.
//
// 발번 규칙:
//   1. WorkOrder.manufacturingNo 가 있으면 `FG-{manufacturingNo}` 를 우선 사용
//   2. 없으면 orderNo 를 사용해 `FG-{orderNo}`
//   3. 둘 다 없으면 `LOT-FG-{YYYYMMDD}-{4자리seq}` 로 fallback
//   4. 같은 lotNo 가 이미 존재하면 itemId 일치 검증 후, 동일 품목이라도
//      부분입고 다회차를 명확히 분리하기 위해 항상 `-01`, `-02` suffix 를 부여하여
//      신규 Lot 을 생성한다. (의료기기 추적성: 입고 1회 = 새로운 완제품 LOT)
//
// 트랜잭션 안에서 Lot.upsert / Lot.create 를 안전하게 수행하기 위해
// findUnique → 충돌 확인 → suffix 결정 → create 순서로 처리한다.

export type FinishedGoodsLotTx = Prisma.TransactionClient

type GenerateInput = {
  manufacturingNo: string | null
  orderNo: string | null
}

function formatYyyymmdd(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "")
}

function baseLotNo(input: GenerateInput): string {
  const mfg = input.manufacturingNo?.trim()
  if (mfg) return `FG-${mfg}`
  const order = input.orderNo?.trim()
  if (order) return `FG-${order}`
  return ""
}

async function generateFallbackLotNo(
  tx: FinishedGoodsLotTx,
  tenantId: string,
): Promise<string> {
  const today = formatYyyymmdd(new Date())
  const prefix = `LOT-FG-${today}-`
  const count = await tx.lot.count({
    where: { tenantId, lotNo: { startsWith: prefix } },
  })
  return `${prefix}${String(count + 1).padStart(4, "0")}`
}

// 동일 lotNo가 같은 itemId 로 이미 존재하면 그 Lot 을 반환,
// 다른 itemId 로 이미 존재하면 suffix(-01, -02, ...) 를 붙여 신규 lotNo 결정.
async function resolveAvailableLotNo(
  tx: FinishedGoodsLotTx,
  tenantId: string,
  candidate: string,
  expectedItemId: string,
): Promise<{ lotNo: string; reuseLot: Lot | null }> {
  const existing = await tx.lot.findUnique({
    where: { tenantId_lotNo: { tenantId, lotNo: candidate } },
  })

  if (!existing) {
    return { lotNo: candidate, reuseLot: null }
  }

  if (existing.itemId === expectedItemId) {
    return { lotNo: candidate, reuseLot: existing }
  }

  // itemId 불일치 — suffix 부여 후 다음 사용 가능한 lotNo 검색
  for (let i = 1; i <= 99; i++) {
    const suffix = String(i).padStart(2, "0")
    const next = `${candidate}-${suffix}`
    const conflict = await tx.lot.findUnique({
      where: { tenantId_lotNo: { tenantId, lotNo: next } },
    })
    if (!conflict) {
      return { lotNo: next, reuseLot: null }
    }
    if (conflict.itemId === expectedItemId) {
      return { lotNo: next, reuseLot: conflict }
    }
  }

  throw new Error(`완제품 LOT 발번 실패: ${candidate} 기반 suffix 100건 모두 충돌`)
}

// 부분입고 다회차마다 새 LOT 을 부여하기 위해 base lotNo 부터 시작해
// 사용 가능한 suffix 까지 자동 부여하는 변형.
async function nextSequentialLotNo(
  tx: FinishedGoodsLotTx,
  tenantId: string,
  base: string,
  expectedItemId: string,
  forceSuffix: boolean,
): Promise<string> {
  if (!forceSuffix) {
    const baseResolved = await resolveAvailableLotNo(tx, tenantId, base, expectedItemId)
    // base 가 없거나 같은 품목 재사용 가능하면 그대로 사용
    if (!baseResolved.reuseLot) return baseResolved.lotNo
    // 같은 품목 LOT 이 이미 존재 → 추가 입고를 위해 -01 부터 suffix 시작
  }

  for (let i = 1; i <= 99; i++) {
    const suffix = String(i).padStart(2, "0")
    const next = `${base}-${suffix}`
    const conflict = await tx.lot.findUnique({
      where: { tenantId_lotNo: { tenantId, lotNo: next } },
    })
    if (!conflict) return next
    if (conflict.itemId !== expectedItemId) continue
    // 같은 품목이지만 이미 사용된 LOT — 다음 번호로 진행
  }

  throw new Error(`완제품 LOT 발번 실패: ${base} suffix 99 회 초과`)
}

export async function createFinishedGoodsLot(
  tx: FinishedGoodsLotTx,
  params: {
    tenantId: string
    workOrder: {
      orderNo: string | null
      manufacturingNo: string | null
      itemId: string
    }
    forceNewLot?: boolean
  },
): Promise<Lot> {
  const { tenantId, workOrder, forceNewLot } = params

  const base = baseLotNo({
    manufacturingNo: workOrder.manufacturingNo,
    orderNo: workOrder.orderNo,
  })

  let lotNo: string
  if (base) {
    lotNo = await nextSequentialLotNo(
      tx,
      tenantId,
      base,
      workOrder.itemId,
      forceNewLot ?? true,
    )
  } else {
    lotNo = await generateFallbackLotNo(tx, tenantId)
  }

  return tx.lot.create({
    data: {
      tenantId,
      itemId: workOrder.itemId,
      lotNo,
      status: "ACTIVE",
      manufactureDate: new Date(),
    },
  })
}
