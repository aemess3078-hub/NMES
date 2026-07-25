"use server"

import { getTenantId, requireRole } from "@/lib/auth"
import { prisma } from "@/lib/db/prisma"
import { computeNextMaterialReceiptLotNo, expireStaleReservations, LOT_RESERVATION_TTL_MS } from "@/lib/lot-numbering/lot-reservation"
import type { CnsItemRuleContext } from "@/lib/lot-numbering/lot-rule-resolver"
import { Prisma } from "@prisma/client"

const MAX_RESERVE_ATTEMPTS = 5

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

export type ReserveReceivingLotNumberInput = {
  purchaseOrderId: string
  purchaseOrderItemId: string
  /** 재채번 시 기존 예약 id — 서버에서 먼저 RELEASED 처리 후 새로 발행한다. */
  previousReservationId?: string
}

export type ReserveReceivingLotNumberResult =
  | { success: true; reservationId: string; lotNo: string; expiresAt: string }
  | { success: false; message: string }

/** 자재입고 LOT 자동채번 "미리보기" — 실제 Lot을 만들지 않고 번호만 예약해 라벨 선출력을 지원한다. */
export async function reserveReceivingLotNumber(
  input: ReserveReceivingLotNumberInput,
): Promise<ReserveReceivingLotNumberResult> {
  try {
    return await reserveReceivingLotNumberInternal(input)
  } catch (error) {
    console.error("[reserveReceivingLotNumber] error:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "LOT 자동채번 중 오류가 발생했습니다.",
    }
  }
}

async function reserveReceivingLotNumberInternal(
  input: ReserveReceivingLotNumberInput,
): Promise<ReserveReceivingLotNumberResult> {
  const user = await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  const poItem = await prisma.purchaseOrderItem.findFirst({
    where: { id: input.purchaseOrderItemId, purchaseOrderId: input.purchaseOrderId },
    include: {
      purchaseOrder: { select: { id: true, tenantId: true } },
      item: {
        select: {
          id: true,
          code: true,
          itemType: true,
          isLotTracked: true,
          lotNumberingType: true,
          lotPrefix: true,
          manualLotPolicy: true,
          itemGroup: { select: { code: true } },
          category: { select: { code: true } },
        },
      },
    },
  })

  if (!poItem || poItem.purchaseOrder.tenantId !== tenantId) {
    return { success: false, message: "발주품목을 찾을 수 없습니다." }
  }
  if (!poItem.item.isLotTracked) {
    return { success: false, message: "LOT 관리 품목이 아닙니다." }
  }

  const lotNumberingType = poItem.item.lotNumberingType ?? "DEFAULT"
  const manualLotPolicy = poItem.item.manualLotPolicy ?? "ALLOWED"
  if (lotNumberingType === "MANUAL" || manualLotPolicy === "REQUIRED") {
    return { success: false, message: "이 품목은 LOT 번호를 직접 입력해야 하는 품목입니다." }
  }

  // 새 예약 발급 전 lazy expiration — 만료된 RESERVED를 EXPIRED로 정리(별도 스케줄러 없음)
  await expireStaleReservations(prisma, tenantId)

  // 재채번: 기존 예약을 먼저 해제(같은 tenant·발주품목 소유일 때만 — 타 tenant/타 예약 보호)
  if (input.previousReservationId) {
    await prisma.lotNumberReservation.updateMany({
      where: {
        id: input.previousReservationId,
        tenantId,
        purchaseOrderItemId: input.purchaseOrderItemId,
        status: "RESERVED",
      },
      data: { status: "RELEASED", releasedAt: new Date() },
    })
  }

  const itemRuleContext: CnsItemRuleContext = {
    itemCode: poItem.item.code,
    itemGroupCode: poItem.item.itemGroup?.code,
    itemCategoryCode: poItem.item.category?.code,
    itemType: poItem.item.itemType,
    lotNumberingType,
    lotPrefix: poItem.item.lotPrefix,
    manualLotPolicy,
  }

  const date = new Date()
  for (let attempt = 0; attempt < MAX_RESERVE_ATTEMPTS; attempt++) {
    const lotNo = await computeNextMaterialReceiptLotNo(prisma, tenantId, itemRuleContext, date, attempt)
    try {
      const expiresAt = new Date(Date.now() + LOT_RESERVATION_TTL_MS)
      const reservation = await prisma.lotNumberReservation.create({
        data: {
          tenantId,
          itemId: poItem.item.id,
          purchaseOrderId: poItem.purchaseOrder.id,
          purchaseOrderItemId: poItem.id,
          lotNo,
          status: "RESERVED",
          reservedBy: user.id,
          expiresAt,
        },
      })
      return {
        success: true,
        reservationId: reservation.id,
        lotNo: reservation.lotNo,
        expiresAt: expiresAt.toISOString(),
      }
    } catch (error) {
      if (isUniqueConstraintError(error) && attempt < MAX_RESERVE_ATTEMPTS - 1) continue
      if (isUniqueConstraintError(error)) {
        return { success: false, message: "LOT 자동채번 중 번호 충돌이 반복되었습니다. 다시 시도해 주세요." }
      }
      throw error
    }
  }
  return { success: false, message: "LOT 자동채번에 실패했습니다. 다시 시도해 주세요." }
}

/**
 * 예약 정리(best-effort) — 재채번, 수동입력 전환, 다이얼로그 취소/닫기, 발주·품목 변경,
 * 입고수량 0 변경 등에서 호출된다. 실패해도 서버의 만료(expiresAt) 정책이 최종 안전망이 되므로
 * 클라이언트는 이 호출의 실패를 무시해도 된다.
 */
export async function releaseLotReservation(input: {
  reservationId: string
}): Promise<{ success: boolean }> {
  try {
    await requireRole("OPERATOR")
    const tenantId = await getTenantId()
    await prisma.lotNumberReservation.updateMany({
      where: { id: input.reservationId, tenantId, status: "RESERVED" },
      data: { status: "RELEASED", releasedAt: new Date() },
    })
    return { success: true }
  } catch (error) {
    console.error("[releaseLotReservation] error:", error)
    return { success: false }
  }
}
