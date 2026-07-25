import type { Prisma, PrismaClient } from "@prisma/client"
import { generateCnsMaterialReceiptLotNo } from "./lot-number-generator"
import type { CnsItemRuleContext } from "./lot-rule-resolver"

// 자동채번 예약 TTL. 라벨 미리보기 후 실제 입고 확정까지 걸리는 현실적인 시간을 고려해 10분으로 설정.
// 운영 정책 변경 시 이 상수만 수정하면 된다.
export const LOT_RESERVATION_TTL_MS = 10 * 60 * 1000

type ReservationLookupClient = {
  lotNumberReservation: Pick<PrismaClient["lotNumberReservation"], "findMany">
}

type LotLookupClient = {
  lot: Pick<PrismaClient["lot"], "findMany">
}

/**
 * 기존 generateCnsMaterialReceiptLotNo를 그대로 재사용하되, Lot 테이블뿐 아니라
 * LotNumberReservation 테이블(RESERVED/CONSUMED/RELEASED/EXPIRED 모든 상태 포함)까지 함께 조회해
 * 이미 예약되었거나 발행된 번호와 겹치지 않는 다음 번호를 계산한다.
 * RELEASED/EXPIRED 예약도 조회 대상에 포함시켜 "취소·만료된 번호도 영구히 재사용하지 않는다"는
 * 정책을 순번 계산 단계에서부터 보장한다.
 */
export async function computeNextMaterialReceiptLotNo(
  db: LotLookupClient & ReservationLookupClient,
  tenantId: string,
  context: CnsItemRuleContext,
  date: Date,
  sequenceOffset = 0,
): Promise<string> {
  const combinedLookup = {
    lot: {
      findMany: async (args: Prisma.LotFindManyArgs) => {
        const [lots, reservations] = await Promise.all([
          db.lot.findMany(args),
          db.lotNumberReservation.findMany({
            where: args.where as Prisma.LotNumberReservationWhereInput,
            select: { lotNo: true },
            take: args.take,
          }),
        ])
        return [...lots, ...reservations]
      },
    },
  }
  return generateCnsMaterialReceiptLotNo(combinedLookup, tenantId, context, date, sequenceOffset)
}
