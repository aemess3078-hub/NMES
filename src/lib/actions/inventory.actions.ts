"use server"

import { prisma } from "@/lib/db/prisma"
import { TransactionType } from "@prisma/client"
import { revalidatePath } from "next/cache"

// ─── Types ────────────────────────────────────────────────────────────────────

export type InventoryBalanceWithDetails = {
  id: string
  tenantId: string
  siteId: string
  warehouseId: string
  itemId: string
  lotId: string | null
  qtyOnHand: any      // Decimal
  qtyAvailable: any   // Decimal
  qtyHold: any        // Decimal
  updatedAt: Date
  warehouse: { id: string; code: string; name: string; siteId: string; site: { id: string; code: string; name: string } }
  item: { id: string; code: string; name: string; itemType: string; uom: string }
  lot: { id: string; lotNo: string } | null
}

export type InventoryTransactionWithDetails = {
  id: string
  tenantId: string
  itemId: string
  lotId: string | null
  fromLocationId: string | null
  toLocationId: string | null
  txNo: string
  txType: TransactionType
  qty: any  // Decimal
  refType: string | null
  refId: string | null
  note: string | null
  txAt: Date
  item: { id: string; code: string; name: string; itemType: string; uom: string }
  lot: { id: string; lotNo: string } | null
  fromLocation: { id: string; code: string; name: string } | null
  toLocation: { id: string; code: string; name: string } | null
}

// ─── 재고현황 조회 ─────────────────────────────────────────────────────────────

export async function getInventoryBalances(): Promise<InventoryBalanceWithDetails[]> {
  return prisma.inventoryBalance.findMany({
    include: {
      warehouse: { include: { site: true } },
      item: true,
      lot: { select: { id: true, lotNo: true } },
    },
    orderBy: [
      { warehouse: { name: "asc" } },
      { item: { code: "asc" } },
    ],
  }) as any
}

export async function getWarehousesBySite(siteId: string) {
  return prisma.warehouse.findMany({
    where: { siteId },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  })
}

// ─── 트랜잭션 이력 조회 (최신 200건) ──────────────────────────────────────────

export async function getInventoryTransactions(): Promise<InventoryTransactionWithDetails[]> {
  return prisma.inventoryTransaction.findMany({
    include: {
      item: true,
      lot: { select: { id: true, lotNo: true } },
      fromLocation: { select: { id: true, code: true, name: true } },
      toLocation: { select: { id: true, code: true, name: true } },
    },
    orderBy: { txAt: "desc" },
    take: 200,
  }) as any
}

// ─── 창고 목록 (트랜잭션 로케이션 선택용) ────────────────────────────────────

export async function getWarehousesForTransaction() {
  return prisma.warehouse.findMany({
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  })
}

// ─── 품목 목록 (재고 전체) ────────────────────────────────────────────────────

export async function getItemsForInventory() {
  return prisma.item.findMany({
    select: { id: true, code: true, name: true, itemType: true, uom: true },
    orderBy: { code: "asc" },
  })
}

// ─── 사이트 목록 ──────────────────────────────────────────────────────────────

export async function getSitesForInventory() {
  return prisma.site.findMany({
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  })
}

// ─── 사이트별 품목 목록 (재고 보유 품목만) ──────────────────────────────────────

export async function getItemsForSite(siteId: string) {
  const balances = await prisma.inventoryBalance.findMany({
    where: { siteId },
    select: {
      qtyOnHand: true,
      item: {
        select: { id: true, code: true, name: true, itemType: true, uom: true },
      },
    },
    orderBy: { item: { code: "asc" } },
  })

  // 같은 품목이 여러 창고에 있을 수 있으므로 집계
  const map = new Map<string, { id: string; code: string; name: string; itemType: string; uom: string; qtyOnHand: number }>()
  for (const b of balances) {
    const existing = map.get(b.item.id)
    if (existing) {
      existing.qtyOnHand += Number(b.qtyOnHand)
    } else {
      map.set(b.item.id, { ...b.item, qtyOnHand: Number(b.qtyOnHand) })
    }
  }

  return Array.from(map.values())
}

// ─── CreateTransaction 타입 ───────────────────────────────────────────────────

export type CreateTransactionInput = {
  siteId: string
  fromLocationId?: string | null
  toLocationId?: string | null
  itemId: string
  lotId?: string | null
  txType: TransactionType
  qty: number
  refType?: string | null
  note?: string | null
}

// ─── Balance 갱신 헬퍼 ────────────────────────────────────────────────────────

async function adjustBalance(
  tx: any,
  params: {
    tenantId: string
    siteId: string
    warehouseId: string
    itemId: string
    lotId: string | null
    qtyDelta?: number      // RECEIPT/ISSUE/TRANSFER 증감
    qtyAbsolute?: number   // ADJUST 직접 세팅
  }
) {
  const where = {
    tenantId: params.tenantId,
    siteId: params.siteId,
    warehouseId: params.warehouseId,
    itemId: params.itemId,
    lotId: params.lotId ?? null,
  }

  const existing = await tx.inventoryBalance.findFirst({ where })

  if (params.qtyAbsolute !== undefined) {
    // ADJUST: qtyOnHand를 직접 세팅, qtyAvailable도 동일하게
    const absQty = Math.max(0, params.qtyAbsolute)
    if (existing) {
      return tx.inventoryBalance.update({
        where: { id: existing.id },
        data: { qtyOnHand: absQty, qtyAvailable: absQty },
      })
    } else {
      return tx.inventoryBalance.create({
        data: { ...where, qtyOnHand: absQty, qtyAvailable: absQty, qtyHold: 0 },
      })
    }
  }

  const delta = params.qtyDelta ?? 0

  if (existing) {
    const newQty = Number(existing.qtyOnHand) + delta
    if (newQty < 0) {
      throw new Error(
        `재고 부족: 현재 재고 ${Number(existing.qtyOnHand).toLocaleString()}, 요청 ${Math.abs(delta).toLocaleString()}`
      )
    }
    return tx.inventoryBalance.update({
      where: { id: existing.id },
      data: { qtyOnHand: newQty, qtyAvailable: Math.max(0, newQty - Number(existing.qtyHold)) },
    })
  } else {
    if (delta < 0) throw new Error("재고 부족: 해당 창고에 재고가 없습니다.")
    return tx.inventoryBalance.create({
      data: { ...where, qtyOnHand: delta, qtyAvailable: delta, qtyHold: 0 },
    })
  }
}

// ─── txNo 생성 ────────────────────────────────────────────────────────────────

async function generateTxNo(tenantId: string, txType: TransactionType): Promise<string> {
  const prefix = {
    RECEIPT: "RCP",
    ISSUE: "ISS",
    TRANSFER: "TRF",
    ADJUST: "ADJ",
    RETURN: "RTN",
    SCRAP: "SCR",
  }[txType] ?? "TXN"

  const today = new Date()
  const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, "")

  const count = await prisma.inventoryTransaction.count({
    where: {
      tenantId,
      txNo: { startsWith: `${prefix}-${yyyymmdd}` },
    },
  })

  return `${prefix}-${yyyymmdd}-${String(count + 1).padStart(4, "0")}`
}

// ─── 트랜잭션 등록 + Balance 자동 갱신 ───────────────────────────────────────

export async function createTransaction(
  data: CreateTransactionInput,
  tenantId: string
) {
  const txNo = await generateTxNo(tenantId, data.txType)

  await prisma.$transaction(async (tx) => {
    // 1. InventoryTransaction 생성
    await tx.inventoryTransaction.create({
      data: {
        tenantId,
        itemId: data.itemId,
        lotId: data.lotId ?? null,
        fromLocationId: data.fromLocationId ?? null,
        toLocationId: data.toLocationId ?? null,
        txNo,
        txType: data.txType,
        qty: data.qty,
        refType: data.refType ?? null,
        refId: null,
        note: data.note ?? null,
        txAt: new Date(),
      },
    })

    // 2. Balance 갱신 (txType별 분기)
    switch (data.txType) {
      case TransactionType.RECEIPT:
      case TransactionType.RETURN: {
        // 입고 / 반품 → toLocation (Warehouse) + qtyOnHand 증가
        if (!data.toLocationId) throw new Error("입고/반품 시 입고 로케이션이 필요합니다.")
        const wh = await tx.warehouse.findUnique({ where: { id: data.toLocationId } })
        if (!wh) throw new Error("유효하지 않은 로케이션입니다.")
        await adjustBalance(tx, {
          tenantId,
          siteId: data.siteId,
          warehouseId: data.toLocationId,
          itemId: data.itemId,
          lotId: data.lotId ?? null,
          qtyDelta: +data.qty,
        })
        break
      }

      case TransactionType.ISSUE:
      case TransactionType.SCRAP: {
        // 출고 / 폐기 → fromLocation (Warehouse) + qtyOnHand 감소
        if (!data.fromLocationId) throw new Error("출고/폐기 시 출고 로케이션이 필요합니다.")
        await adjustBalance(tx, {
          tenantId,
          siteId: data.siteId,
          warehouseId: data.fromLocationId,
          itemId: data.itemId,
          lotId: data.lotId ?? null,
          qtyDelta: -data.qty,
        })
        break
      }

      case TransactionType.ADJUST: {
        // 재고조정 → fromLocation (또는 toLocation, Warehouse) + qtyOnHand 절대값 세팅
        const warehouseId = data.fromLocationId ?? data.toLocationId
        if (!warehouseId) throw new Error("재고조정 시 로케이션이 필요합니다.")
        await adjustBalance(tx, {
          tenantId,
          siteId: data.siteId,
          warehouseId,
          itemId: data.itemId,
          lotId: data.lotId ?? null,
          qtyAbsolute: data.qty,
        })
        break
      }

      case TransactionType.TRANSFER: {
        // 이동 → fromLocation 감소 + toLocation 증가 (모두 Warehouse)
        if (!data.fromLocationId || !data.toLocationId) {
          throw new Error("이동 시 출발 로케이션과 도착 로케이션이 모두 필요합니다.")
        }
        await adjustBalance(tx, {
          tenantId,
          siteId: data.siteId,
          warehouseId: data.fromLocationId,
          itemId: data.itemId,
          lotId: data.lotId ?? null,
          qtyDelta: -data.qty,
        })
        await adjustBalance(tx, {
          tenantId,
          siteId: data.siteId,
          warehouseId: data.toLocationId,
          itemId: data.itemId,
          lotId: data.lotId ?? null,
          qtyDelta: +data.qty,
        })
        break
      }

      default:
        throw new Error(`지원하지 않는 트랜잭션 유형입니다: ${data.txType}`)
    }
  })

  revalidatePath("/app/mes/inventory")
  revalidatePath("/app/mes/inventory-transactions")
}
