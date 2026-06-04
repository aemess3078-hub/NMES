"use server"

import { prisma } from "@/lib/db/prisma"
import { TransactionType } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { requireRole } from "@/lib/auth"

// ─── Types ────────────────────────────────────────────────────────────────────

export type InventoryBalanceWithDetails = {
  id: string
  tenantId: string
  siteId: string
  warehouseId: string
  itemId: string
  lotId: string | null
  qtyOnHand: number
  qtyAvailable: number
  qtyHold: number
  updatedAt: Date
  lastReceiptAt: Date | null
  lastIssueAt: Date | null
  warehouse: { id: string; code: string; name: string; siteId: string; site: { id: string; code: string; name: string } }
  item: { id: string; code: string; name: string; itemType: string; uom: string; spec: string | null; isLotTracked?: boolean; status?: string }
  lot: { id: string; lotNo: string; manufactureDate: Date | null; expiryDate: Date | null } | null
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
  qty: number
  refType: string | null
  refId: string | null
  note: string | null
  txAt: Date
  item: { id: string; code: string; name: string; itemType: string; uom: string; spec: string | null }
  lot: { id: string; lotNo: string } | null
  fromLocation: { id: string; code: string; name: string } | null
  toLocation: { id: string; code: string; name: string } | null
  workOrderLinks: {
    id: string
    manufacturingNo: string | null
    workOrder: { id: string; orderNo: string; manufacturingNo: string | null } | null
  }[]
}

// ─── 재고현황 조회 ─────────────────────────────────────────────────────────────

export async function getInventoryBalances(): Promise<InventoryBalanceWithDetails[]> {
  const rows = await prisma.inventoryBalance.findMany({
    include: {
      warehouse: { include: { site: true } },
      item: { select: { id: true, code: true, name: true, itemType: true, uom: true, spec: true, isLotTracked: true, status: true } },
      lot: { select: { id: true, lotNo: true, manufactureDate: true, expiryDate: true } },
    },
    orderBy: [
      { warehouse: { name: "asc" } },
      { item: { code: "asc" } },
    ],
  })
  return rows.map((b) => ({
    ...b,
    qtyOnHand:    Number(b.qtyOnHand),
    qtyAvailable: Number(b.qtyAvailable),
    qtyHold:      Number(b.qtyHold),
    lastReceiptAt: null,
    lastIssueAt: null,
  }))
}

export async function getMaterialInventoryBalances(): Promise<InventoryBalanceWithDetails[]> {
  const rows = await prisma.inventoryBalance.findMany({
    where: {
      item: { itemType: { in: ["RAW_MATERIAL", "CONSUMABLE"] } },
    },
    include: {
      warehouse: { include: { site: true } },
      // item: true → 필요 필드만 select (code/name/itemType/uom만 사용됨)
      item: { select: { id: true, code: true, name: true, itemType: true, uom: true, spec: true, isLotTracked: true, status: true } },
      lot: { select: { id: true, lotNo: true, manufactureDate: true, expiryDate: true } },
    },
    orderBy: [
      { warehouse: { name: "asc" } },
      { item: { code: "asc" } },
    ],
  })
  const txRows = await prisma.inventoryTransaction.findMany({
    where: {
      itemId: { in: Array.from(new Set(rows.map((row) => row.itemId))) },
      txType: { in: ["RECEIPT", "ISSUE"] },
    },
    select: {
      itemId: true,
      lotId: true,
      fromLocationId: true,
      toLocationId: true,
      txType: true,
      txAt: true,
    },
    orderBy: { txAt: "desc" },
  })

  const lastReceiptMap = new Map<string, Date>()
  const lastIssueMap = new Map<string, Date>()

  for (const tx of txRows) {
    const warehouseId = tx.txType === "RECEIPT" ? tx.toLocationId : tx.fromLocationId
    if (!warehouseId) continue
    const key = `${tx.itemId}:${tx.lotId ?? "NO_LOT"}:${warehouseId}`
    if (tx.txType === "RECEIPT" && !lastReceiptMap.has(key)) {
      lastReceiptMap.set(key, tx.txAt)
    }
    if (tx.txType === "ISSUE" && !lastIssueMap.has(key)) {
      lastIssueMap.set(key, tx.txAt)
    }
  }

  return rows.map((b) => {
    const key = `${b.itemId}:${b.lotId ?? "NO_LOT"}:${b.warehouseId}`
    return {
      ...b,
      qtyOnHand:    Number(b.qtyOnHand),
      qtyAvailable: Number(b.qtyAvailable),
      qtyHold:      Number(b.qtyHold),
      lastReceiptAt: lastReceiptMap.get(key) ?? null,
      lastIssueAt: lastIssueMap.get(key) ?? null,
    }
  })
}

// ─── 품목 기준 그룹화 재고 ─────────────────────────────────────────────────────

export type LotBalanceDetail = {
  balanceId: string
  lotId: string | null
  lotNo: string | null
  warehouseId: string
  warehouseCode: string
  warehouseName: string
  siteName: string
  qtyOnHand: number
  qtyAvailable: number
  qtyHold: number
  manufactureDate: string | null
  expiryDate: string | null
  lastReceiptAt: string | null
  lastIssueAt: string | null
}

export type GroupedMaterialStock = {
  itemId: string
  itemCode: string
  itemName: string
  itemType: string
  itemSpec: string | null
  uom: string
  isLotTracked: boolean
  totalQtyOnHand: number
  totalQtyAvailable: number
  totalQtyHold: number
  lotCount: number           // distinct non-null lotId count
  warehouseCount: number     // distinct warehouseId count
  hasUnlottedStock: boolean  // isLotTracked=true AND lotId=null row with qty > 0
  lotBalances: LotBalanceDetail[]
}

export async function getGroupedMaterialInventoryBalances(): Promise<GroupedMaterialStock[]> {
  const balances = await getMaterialInventoryBalances()

  type Accumulator = {
    group: GroupedMaterialStock
    lotIdSet: Set<string>
    warehouseIdSet: Set<string>
  }
  const groupMap = new Map<string, Accumulator>()

  for (const balance of balances) {
    const lotDetail: LotBalanceDetail = {
      balanceId: balance.id,
      lotId: balance.lotId,
      lotNo: balance.lot?.lotNo ?? null,
      warehouseId: balance.warehouseId,
      warehouseCode: balance.warehouse.code,
      warehouseName: balance.warehouse.name,
      siteName: balance.warehouse.site.name,
      qtyOnHand: balance.qtyOnHand,
      qtyAvailable: balance.qtyAvailable,
      qtyHold: balance.qtyHold,
      manufactureDate: balance.lot?.manufactureDate instanceof Date
        ? balance.lot.manufactureDate.toISOString()
        : null,
      expiryDate: balance.lot?.expiryDate instanceof Date
        ? balance.lot.expiryDate.toISOString()
        : null,
      lastReceiptAt: balance.lastReceiptAt instanceof Date
        ? balance.lastReceiptAt.toISOString()
        : null,
      lastIssueAt: balance.lastIssueAt instanceof Date
        ? balance.lastIssueAt.toISOString()
        : null,
    }

    const isUnlotted = (balance.item.isLotTracked ?? false) && !balance.lotId && balance.qtyOnHand > 0

    const existing = groupMap.get(balance.itemId)
    if (existing) {
      existing.group.totalQtyOnHand += balance.qtyOnHand
      existing.group.totalQtyAvailable += balance.qtyAvailable
      existing.group.totalQtyHold += balance.qtyHold
      if (balance.lotId) existing.lotIdSet.add(balance.lotId)
      existing.warehouseIdSet.add(balance.warehouseId)
      if (isUnlotted) existing.group.hasUnlottedStock = true
      existing.group.lotBalances.push(lotDetail)
    } else {
      const lotIdSet = new Set<string>()
      const warehouseIdSet = new Set<string>()
      if (balance.lotId) lotIdSet.add(balance.lotId)
      warehouseIdSet.add(balance.warehouseId)
      groupMap.set(balance.itemId, {
        group: {
          itemId: balance.itemId,
          itemCode: balance.item.code,
          itemName: balance.item.name,
          itemType: balance.item.itemType,
          itemSpec: balance.item.spec ?? null,
          uom: balance.item.uom,
          isLotTracked: balance.item.isLotTracked ?? false,
          totalQtyOnHand: balance.qtyOnHand,
          totalQtyAvailable: balance.qtyAvailable,
          totalQtyHold: balance.qtyHold,
          lotCount: 0,
          warehouseCount: 0,
          hasUnlottedStock: isUnlotted,
          lotBalances: [lotDetail],
        },
        lotIdSet,
        warehouseIdSet,
      })
    }
  }

  return Array.from(groupMap.values())
    .map(({ group, lotIdSet, warehouseIdSet }) => {
      group.lotCount = lotIdSet.size
      group.warehouseCount = warehouseIdSet.size
      return group
    })
    .sort((a, b) => a.itemCode.localeCompare(b.itemCode))
}

// ─── 전체 품목 기준 그룹화 재고 ───────────────────────────────────────────────

export type InventoryLotBalanceDetail = {
  balanceId: string
  lotId: string | null
  lotNo: string | null
  warehouseId: string
  warehouseCode: string
  warehouseName: string
  siteId: string
  siteName: string
  qtyOnHand: number
  qtyAvailable: number
  qtyHold: number
}

export type GroupedInventoryStock = {
  itemId: string
  itemCode: string
  itemName: string
  itemType: string
  itemSpec: string | null
  uom: string
  isLotTracked: boolean
  totalQtyOnHand: number
  totalQtyAvailable: number
  totalQtyHold: number
  lotCount: number
  warehouseCount: number
  hasUnlottedStock: boolean
  balances: InventoryLotBalanceDetail[]
}

export async function getGroupedInventoryBalances(): Promise<GroupedInventoryStock[]> {
  const rows = await prisma.inventoryBalance.findMany({
    include: {
      warehouse: { include: { site: true } },
      item: { select: { id: true, code: true, name: true, itemType: true, uom: true, spec: true, isLotTracked: true } },
      lot: { select: { id: true, lotNo: true } },
    },
    orderBy: { item: { code: "asc" } },
  })

  type Acc = { group: GroupedInventoryStock; lotIdSet: Set<string>; warehouseIdSet: Set<string> }
  const groupMap = new Map<string, Acc>()

  for (const b of rows) {
    const qtyOnHand = Number(b.qtyOnHand)
    const qtyAvailable = Number(b.qtyAvailable)
    const qtyHold = Number(b.qtyHold)
    const isLotTracked = b.item.isLotTracked ?? false
    const isUnlotted = isLotTracked && !b.lotId && qtyOnHand > 0

    const balanceDetail: InventoryLotBalanceDetail = {
      balanceId: b.id,
      lotId: b.lotId,
      lotNo: b.lot?.lotNo ?? null,
      warehouseId: b.warehouseId,
      warehouseCode: b.warehouse.code,
      warehouseName: b.warehouse.name,
      siteId: b.warehouse.siteId,
      siteName: b.warehouse.site.name,
      qtyOnHand,
      qtyAvailable,
      qtyHold,
    }

    const existing = groupMap.get(b.itemId)
    if (existing) {
      existing.group.totalQtyOnHand += qtyOnHand
      existing.group.totalQtyAvailable += qtyAvailable
      existing.group.totalQtyHold += qtyHold
      if (b.lotId) existing.lotIdSet.add(b.lotId)
      existing.warehouseIdSet.add(b.warehouseId)
      if (isUnlotted) existing.group.hasUnlottedStock = true
      existing.group.balances.push(balanceDetail)
    } else {
      const lotIdSet = new Set<string>()
      const warehouseIdSet = new Set<string>()
      if (b.lotId) lotIdSet.add(b.lotId)
      warehouseIdSet.add(b.warehouseId)
      groupMap.set(b.itemId, {
        group: {
          itemId: b.itemId,
          itemCode: b.item.code,
          itemName: b.item.name,
          itemType: b.item.itemType,
          itemSpec: b.item.spec ?? null,
          uom: b.item.uom,
          isLotTracked,
          totalQtyOnHand: qtyOnHand,
          totalQtyAvailable: qtyAvailable,
          totalQtyHold: qtyHold,
          lotCount: 0,
          warehouseCount: 0,
          hasUnlottedStock: isUnlotted,
          balances: [balanceDetail],
        },
        lotIdSet,
        warehouseIdSet,
      })
    }
  }

  return Array.from(groupMap.values())
    .map(({ group, lotIdSet, warehouseIdSet }) => {
      group.lotCount = lotIdSet.size
      group.warehouseCount = warehouseIdSet.size
      return group
    })
    .sort((a, b) => a.itemCode.localeCompare(b.itemCode))
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
  const rows = await prisma.inventoryTransaction.findMany({
    include: {
      item: { select: { id: true, code: true, name: true, itemType: true, uom: true, spec: true } },
      lot: { select: { id: true, lotNo: true } },
      fromLocation: { select: { id: true, code: true, name: true } },
      toLocation: { select: { id: true, code: true, name: true } },
      workOrderMaterialLots: {
        select: {
          id: true,
          manufacturingNo: true,
          workOrder: { select: { id: true, orderNo: true, manufacturingNo: true } },
        },
      },
    },
    orderBy: { txAt: "desc" },
    take: 200,
  })
  return rows.map((t) => ({
    ...t,
    qty: Number(t.qty),
    workOrderLinks: t.workOrderMaterialLots,
  }))
}

// ─── 창고 목록 (트랜잭션 로케이션 선택용) ────────────────────────────────────

export async function getWarehousesForTransaction() {
  return prisma.warehouse.findMany({
    select: { id: true, code: true, name: true, siteId: true },
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

// ─── 사이트별 수주 목록 (출고 목적지 - 고객사 출하) ─────────────────────────────

export async function getSalesOrdersForSite(siteId: string) {
  return prisma.salesOrder.findMany({
    where: { siteId, status: { notIn: ["CANCELLED", "CLOSED"] } },
    select: {
      id: true,
      orderNo: true,
      customer: { select: { name: true } },
    },
    orderBy: { orderNo: "desc" },
  })
}

// ─── 사이트별 작업지시 목록 (출고 목적지 - 생산투입) ────────────────────────────

export async function getWorkOrdersForSite(siteId: string) {
  return prisma.workOrder.findMany({
    where: { siteId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    select: {
      id: true,
      orderNo: true,
      item: { select: { name: true } },
      status: true,
    },
    orderBy: { orderNo: "desc" },
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
  refId?: string | null
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
        refId: data.refId ?? null,
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

// ─── 재고실사/재고조정 (의료기기 추적성 보존) ──────────────────────────────────
//
// 고객사 실사 결과와 MES 재고가 다를 때 보정하는 기능.
// 설계 원칙:
//   1) qtyOnHand를 단순 덮어쓰기(set)하지 않는다. 차이수량(diff)만큼 증감한다.
//   2) 기존 입출고 InventoryTransaction은 수정/삭제하지 않는다.
//      차이수량만 refType=STOCK_ADJUSTMENT 인 ADJUST 트랜잭션으로 1건 신규 기록한다.
//   3) 누가/언제/무엇을/사유 를 AuditLog 로 남긴다.
//   4) LOT 관리 품목은 LOT 선택 필수. 비LOT 품목은 창고 기준.
//   5) qtyHold(예약 수량)는 보존하고 qtyAvailable만 재계산한다.
//   6) 라벨 재발행과 분리: 이 액션은 수량 보정만 수행한다.

const STOCK_ADJUSTMENT_REF_TYPE = "STOCK_ADJUSTMENT"

export type StockAdjustmentInput = {
  siteId: string
  warehouseId: string
  itemId: string
  lotId?: string | null
  physicalQty: number // 실사수량
  reason: string      // 조정 사유 (필수)
  note?: string | null
}

export type StockAdjustmentResult = {
  success: boolean
  error?: string
  txNo?: string
  currentQty?: number
  physicalQty?: number
  diffQty?: number
  direction?: "INCREASE" | "DECREASE"
}

export async function adjustInventoryStock(
  input: StockAdjustmentInput
): Promise<StockAdjustmentResult> {
  // 권한: 의료기기 재고 보정은 책임자 권한(MANAGER 이상)으로 제한.
  let actor
  try {
    actor = await requireRole("MANAGER")
  } catch {
    return { success: false, error: "재고조정 권한이 없습니다. (MANAGER 이상 필요)" }
  }
  const tenantId = actor.tenantId

  const { siteId, warehouseId, itemId } = input
  const lotId = input.lotId ?? null
  const reason = input.reason?.trim()

  if (!siteId || !warehouseId || !itemId) {
    return { success: false, error: "사업장/창고/품목은 필수 입력값입니다." }
  }
  if (!reason) {
    return { success: false, error: "재고조정 사유를 입력해 주세요." }
  }
  if (!Number.isFinite(input.physicalQty) || input.physicalQty < 0) {
    return { success: false, error: "실사수량은 0 이상의 숫자여야 합니다." }
  }

  try {
    const item = await prisma.item.findFirst({
      where: { id: itemId, tenantId },
      select: { isLotTracked: true, itemType: true, code: true, name: true },
    })
    if (!item) return { success: false, error: "품목을 찾을 수 없습니다." }

    // LOT 관리 품목(원자재 LOT/완제품 제조번호 추적)은 LOT 선택 필수.
    if (item.isLotTracked && !lotId) {
      return {
        success: false,
        error: "LOT/제조번호 관리 품목은 LOT를 반드시 선택해 조정해야 합니다.",
      }
    }

    const txNo = await generateTxNo(tenantId, TransactionType.ADJUST)

    const result = await prisma.$transaction(async (tx) => {
      const where = { tenantId, siteId, warehouseId, itemId, lotId }
      const existing = await tx.inventoryBalance.findFirst({ where })
      const currentQty = existing ? Number(existing.qtyOnHand) : 0
      const physicalQty = input.physicalQty
      const diffQty = Number((physicalQty - currentQty).toFixed(6))

      if (diffQty === 0) {
        throw new Error("실사수량이 현재고와 동일하여 조정할 내역이 없습니다.")
      }
      if (!existing && diffQty < 0) {
        throw new Error("해당 LOT/창고에 재고 잔고가 없습니다.")
      }

      // 1) 차이수량만 ADJUST 트랜잭션으로 신규 기록 (기존 입출고 이력 미수정)
      //    양수=조정입고(toLocation), 음수=조정출고(fromLocation)
      await tx.inventoryTransaction.create({
        data: {
          tenantId,
          itemId,
          lotId,
          fromLocationId: diffQty < 0 ? warehouseId : null,
          toLocationId: diffQty > 0 ? warehouseId : null,
          txNo,
          txType: TransactionType.ADJUST,
          qty: diffQty, // 부호 있는 차이수량
          refType: STOCK_ADJUSTMENT_REF_TYPE,
          refId: existing?.id ?? null,
          note:
            `재고실사 조정 | 현재고:${currentQty} 실사:${physicalQty} 차이:${diffQty >= 0 ? "+" : ""}${diffQty} | 사유:${reason}` +
            (input.note ? ` | 비고:${input.note}` : ""),
          txAt: new Date(),
        },
      })

      // 2) Balance를 차이수량만큼 증감 (덮어쓰기 금지, qtyHold 보존)
      let newQtyOnHand: number
      let balanceId: string
      if (existing) {
        newQtyOnHand = Number((currentQty + diffQty).toFixed(6))
        if (newQtyOnHand < 0) {
          throw new Error("조정 후 재고가 음수가 될 수 없습니다.")
        }
        const qtyHold = Number(existing.qtyHold)
        await tx.inventoryBalance.update({
          where: { id: existing.id },
          data: {
            qtyOnHand: newQtyOnHand,
            qtyAvailable: Math.max(0, Number((newQtyOnHand - qtyHold).toFixed(6))),
          },
        })
        balanceId = existing.id
      } else {
        newQtyOnHand = physicalQty
        const created = await tx.inventoryBalance.create({
          data: { ...where, qtyOnHand: newQtyOnHand, qtyAvailable: newQtyOnHand, qtyHold: 0 },
        })
        balanceId = created.id
      }

      // 3) AuditLog (누가/언제/무엇을/사유)
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actor.profileId,
          actorType: "USER",
          actorLabel: actor.name,
          entityType: "InventoryBalance",
          entityId: balanceId,
          action: "UPDATE",
          menuName: "재고조정",
          beforeData: { qtyOnHand: currentQty },
          afterData: {
            qtyOnHand: newQtyOnHand,
            physicalQty,
            diffQty,
            reason,
            note: input.note ?? null,
            txNo,
            itemId,
            itemCode: item.code,
            warehouseId,
            lotId,
          },
        },
      })

      return { currentQty, physicalQty, diffQty }
    })

    revalidatePath("/app/mes/inventory")
    revalidatePath("/app/mes/inventory-transactions")

    return {
      success: true,
      txNo,
      currentQty: result.currentQty,
      physicalQty: result.physicalQty,
      diffQty: result.diffQty,
      direction: result.diffQty > 0 ? "INCREASE" : "DECREASE",
    }
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "재고조정 중 오류가 발생했습니다.",
    }
  }
}

// ─── 재고조정 이력 조회 ────────────────────────────────────────────────────────

export type StockAdjustmentHistoryRow = {
  id: string
  txNo: string
  txAt: string
  itemCode: string
  itemName: string
  lotNo: string | null
  warehouseName: string | null
  diffQty: number
  note: string | null
}

export async function getStockAdjustmentHistory(): Promise<StockAdjustmentHistoryRow[]> {
  const rows = await prisma.inventoryTransaction.findMany({
    where: { refType: STOCK_ADJUSTMENT_REF_TYPE },
    include: {
      item: { select: { code: true, name: true } },
      lot: { select: { lotNo: true } },
      fromLocation: { select: { name: true } },
      toLocation: { select: { name: true } },
    },
    orderBy: { txAt: "desc" },
    take: 500,
  })

  return rows.map((r) => ({
    id: r.id,
    txNo: r.txNo,
    txAt: r.txAt.toISOString(),
    itemCode: r.item.code,
    itemName: r.item.name,
    lotNo: r.lot?.lotNo ?? null,
    warehouseName: r.toLocation?.name ?? r.fromLocation?.name ?? null,
    diffQty: Number(r.qty),
    note: r.note,
  }))
}
