"use server"

import { prisma } from "@/lib/db/prisma"
import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { requireRole, getTenantId } from "@/lib/auth"
import { getErrorMessage } from "@/lib/utils"
import { toKstDateKey } from "@/lib/date/kst"
import { MATERIAL_RETURN_STATUS_TRANSITIONS } from "@/lib/material-return-status"

// ─── 청운커팅 사업계획서 "자재관리 > 반품관리" (PR #50) ────────────────────────
//
// 정상 입고되어 회사 재고가 된 자재를 공급사에 반품하는 업무만 다룬다. 입고검사
// 불합격 수량의 공급사 반송 workflow는 별개이며 이번 PR의 범위가 아니다.
// PO/입고 이력(PurchaseOrderItem.receivedQty, ReceivingInspection, PurchaseOrder.status)은
// read-only 원장으로만 참조하고 절대 수정하지 않는다.
// 모든 조회/등록/수정/삭제/상태변경 액션은 클라이언트가 넘긴 tenantId를 신뢰하지
// 않고 getTenantId()로 세션에서 직접 구한다.

const MENU_NAME = "반품관리"
const CODE_GENERATION_MAX_ATTEMPTS = 3
const TXN_GENERATION_MAX_ATTEMPTS = 3

function revalidateMaterialReturnPaths() {
  revalidatePath("/app/mes/material-return")
  revalidatePath("/app/mes/inventory")
  revalidatePath("/app/mes/material/stock")
  revalidatePath("/app/mes/inventory-transactions")
}

function assertPositiveQty(qty: number, label: string) {
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error(`${label} 수량은 0보다 커야 합니다.`)
  }
}

// ─── 번호 생성 (내부 전용) ────────────────────────────────────────────────────

async function generateMaterialReturnNo(tenantId: string): Promise<string> {
  const kstYear = toKstDateKey(new Date()).slice(0, 4)
  const prefix = `SR-${kstYear}-`
  const last = await prisma.materialReturn.findFirst({
    where: { tenantId, returnNo: { startsWith: prefix } },
    orderBy: { returnNo: "desc" },
    select: { returnNo: true },
  })
  const seq = last ? (parseInt(last.returnNo.split("-")[2] ?? "0", 10) || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(3, "0")}`
}

// ─── 조회 ───────────────────────────────────────────────────────────────────

export type MaterialReturnRow = {
  id: string
  returnNo: string
  status: "DRAFT" | "COMPLETED" | "CANCELLED"
  supplier: { id: string; name: string }
  purchaseOrder: { id: string; orderNo: string } | null
  reason: string | null
  itemCount: number
  totalReturnQty: number
  createdBy: { id: string; name: string }
  completedBy: { id: string; name: string } | null
  createdAt: Date
  completedAt: Date | null
}

const RETURN_LIST_SELECT = {
  id: true,
  returnNo: true,
  status: true,
  reason: true,
  createdAt: true,
  completedAt: true,
  supplier: { select: { id: true, name: true } },
  purchaseOrder: { select: { id: true, orderNo: true } },
  createdBy: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
  items: { select: { returnQty: true } },
} satisfies Prisma.MaterialReturnSelect

export async function getMaterialReturnList(): Promise<MaterialReturnRow[]> {
  const tenantId = await getTenantId()
  const rows = await prisma.materialReturn.findMany({
    where: { tenantId },
    select: RETURN_LIST_SELECT,
    orderBy: { createdAt: "desc" },
  })
  return rows.map((r) => ({
    id: r.id,
    returnNo: r.returnNo,
    status: r.status,
    supplier: r.supplier,
    purchaseOrder: r.purchaseOrder,
    reason: r.reason,
    itemCount: r.items.length,
    totalReturnQty: r.items.reduce((s, i) => s + Number(i.returnQty), 0),
    createdBy: r.createdBy,
    completedBy: r.completedBy,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
  }))
}

export type MaterialReturnItemDetail = {
  id: string
  item: { id: string; code: string; name: string; uom: string; spec: string | null; isLotTracked: boolean }
  purchaseOrderItem: { id: string; purchaseOrderId: string; purchaseOrderNo: string } | null
  lot: { id: string; lotNo: string } | null
  warehouse: { id: string; code: string; name: string }
  returnQty: number
  note: string | null
  inventoryTransactionId: string | null
}

export type MaterialReturnDetail = MaterialReturnRow & {
  note: string | null
  items: MaterialReturnItemDetail[]
}

export async function getMaterialReturnDetail(id: string): Promise<MaterialReturnDetail> {
  const tenantId = await getTenantId()
  const r = await prisma.materialReturn.findFirst({
    where: { id, tenantId },
    select: {
      ...RETURN_LIST_SELECT,
      note: true,
      items: {
        select: {
          id: true,
          returnQty: true,
          note: true,
          inventoryTransactionId: true,
          item: { select: { id: true, code: true, name: true, uom: true, spec: true, isLotTracked: true } },
          lot: { select: { id: true, lotNo: true } },
          warehouse: { select: { id: true, code: true, name: true } },
          purchaseOrderItem: { select: { id: true, purchaseOrderId: true, purchaseOrder: { select: { orderNo: true } } } },
        },
      },
    },
  })
  if (!r) throw new Error("반품 건을 찾을 수 없습니다.")

  return {
    id: r.id,
    returnNo: r.returnNo,
    status: r.status,
    supplier: r.supplier,
    purchaseOrder: r.purchaseOrder,
    reason: r.reason,
    note: r.note,
    itemCount: r.items.length,
    totalReturnQty: r.items.reduce((s, i) => s + Number(i.returnQty), 0),
    createdBy: r.createdBy,
    completedBy: r.completedBy,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    items: r.items.map((i) => ({
      id: i.id,
      item: i.item,
      purchaseOrderItem: i.purchaseOrderItem
        ? { id: i.purchaseOrderItem.id, purchaseOrderId: i.purchaseOrderItem.purchaseOrderId, purchaseOrderNo: i.purchaseOrderItem.purchaseOrder.orderNo }
        : null,
      lot: i.lot,
      warehouse: i.warehouse,
      returnQty: Number(i.returnQty),
      note: i.note,
      inventoryTransactionId: i.inventoryTransactionId,
    })),
  }
}

// 등록 Dialog: 공급사 선택지 (SUPPLIER/BOTH)
export async function getMaterialReturnSuppliers() {
  const tenantId = await getTenantId()
  const partners = await prisma.businessPartner.findMany({
    where: { tenantId, partnerType: { in: ["SUPPLIER", "BOTH"] }, status: "ACTIVE" },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  })
  return partners
}

// 등록 Dialog: 선택된 공급사의 발주 목록 (선택 사항 — PO 연결 없이도 반품 가능)
export async function getMaterialReturnPurchaseOrders(supplierId: string) {
  const tenantId = await getTenantId()
  const orders = await prisma.purchaseOrder.findMany({
    where: { tenantId, supplierId },
    select: { id: true, orderNo: true, orderDate: true },
    orderBy: { orderDate: "desc" },
  })
  return orders
}

// 등록 Dialog: 선택된 발주의 품목별 실제 합격입고수량 / 기존 완료 반품 누적수량
export type MaterialReturnPoItemOption = {
  id: string
  itemId: string
  itemCode: string
  itemName: string
  uom: string
  isLotTracked: boolean
  acceptedQty: number
  returnedQty: number
  returnableQty: number
}

export async function getMaterialReturnPoItems(purchaseOrderId: string): Promise<MaterialReturnPoItemOption[]> {
  const tenantId = await getTenantId()
  const po = await prisma.purchaseOrder.findFirst({ where: { id: purchaseOrderId, tenantId }, select: { id: true } })
  if (!po) throw new Error("발주를 찾을 수 없습니다.")

  const items = await prisma.purchaseOrderItem.findMany({
    where: { purchaseOrderId },
    select: {
      id: true,
      item: { select: { id: true, code: true, name: true, uom: true, isLotTracked: true } },
      receivingInspections: { select: { acceptedQty: true } },
      materialReturnItems: {
        where: { materialReturn: { status: "COMPLETED" } },
        select: { returnQty: true },
      },
    },
  })

  return items.map((poi) => {
    const acceptedQty = poi.receivingInspections.reduce((s, r) => s + Number(r.acceptedQty), 0)
    const returnedQty = poi.materialReturnItems.reduce((s, ri) => s + Number(ri.returnQty), 0)
    return {
      id: poi.id,
      itemId: poi.item.id,
      itemCode: poi.item.code,
      itemName: poi.item.name,
      uom: poi.item.uom,
      isLotTracked: poi.item.isLotTracked,
      acceptedQty,
      returnedQty,
      returnableQty: Math.max(0, acceptedQty - returnedQty),
    }
  })
}

// 등록 Dialog: PO 미연결 직접 반품용 품목 선택지 (원자재/반제품/소모품)
export async function getMaterialReturnItemOptions() {
  const tenantId = await getTenantId()
  return prisma.item.findMany({
    where: { tenantId, status: "ACTIVE", itemType: { in: ["RAW_MATERIAL", "SEMI_FINISHED", "CONSUMABLE"] } },
    select: { id: true, code: true, name: true, uom: true, isLotTracked: true },
    orderBy: { name: "asc" },
  })
}

// 등록 Dialog: 특정 품목의 창고별(LOT관리 품목은 LOT별) 가용재고
export type MaterialReturnStockOption = {
  warehouseId: string
  warehouseCode: string
  warehouseName: string
  lotId: string | null
  lotNo: string | null
  qtyAvailable: number
}

export async function getMaterialReturnItemStock(itemId: string): Promise<MaterialReturnStockOption[]> {
  const tenantId = await getTenantId()
  const balances = await prisma.inventoryBalance.findMany({
    where: { tenantId, itemId, qtyAvailable: { gt: 0 } },
    select: {
      qtyAvailable: true,
      warehouse: { select: { id: true, code: true, name: true } },
      lot: { select: { id: true, lotNo: true } },
    },
    orderBy: [{ warehouse: { name: "asc" } }],
  })
  return balances.map((b) => ({
    warehouseId: b.warehouse.id,
    warehouseCode: b.warehouse.code,
    warehouseName: b.warehouse.name,
    lotId: b.lot?.id ?? null,
    lotNo: b.lot?.lotNo ?? null,
    qtyAvailable: Number(b.qtyAvailable),
  }))
}

// ─── 입력 검증 (등록/수정/완료 공용) ──────────────────────────────────────────

export type MaterialReturnItemInput = {
  itemId: string
  purchaseOrderItemId?: string | null
  lotId?: string | null
  warehouseId: string
  returnQty: number
  note?: string | null
}

export type MaterialReturnHeaderInput = {
  supplierId: string
  purchaseOrderId?: string | null
  reason?: string | null
  note?: string | null
  items: MaterialReturnItemInput[]
}

type ValidatedItem = MaterialReturnItemInput & {
  itemCode: string
  isLotTracked: boolean
}

// §8: returnQty <= qtyAvailable(항상) AND (purchaseOrderItemId 연결 시) 누적 완료
// 반품수량 + 금회 반품수량 <= 실제 합격입고수량. LOT 품목은 기존 LOT만 허용(신규
// LOT 생성 금지) + tenant/item 일치 검증. 비LOT 품목은 lotId를 받지 않는다.
async function validateMaterialReturnInput(
  tenantId: string,
  input: MaterialReturnHeaderInput
): Promise<ValidatedItem[]> {
  const supplier = await prisma.businessPartner.findFirst({
    where: { id: input.supplierId, tenantId, partnerType: { in: ["SUPPLIER", "BOTH"] } },
    select: { id: true },
  })
  if (!supplier) throw new Error("공급사를 찾을 수 없습니다.")

  if (input.purchaseOrderId) {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: input.purchaseOrderId, tenantId, supplierId: input.supplierId },
      select: { id: true },
    })
    if (!po) throw new Error("선택한 발주는 해당 공급사의 발주가 아닙니다.")
  }

  if (input.items.length === 0) throw new Error("반품 품목을 1건 이상 입력하세요.")

  const itemIds = Array.from(new Set(input.items.map((i) => i.itemId)))
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds }, tenantId },
    select: { id: true, code: true, isLotTracked: true },
  })
  const itemMap = new Map(items.map((i) => [i.id, i]))

  const warehouseIds = Array.from(new Set(input.items.map((i) => i.warehouseId)))
  const warehouses = await prisma.warehouse.findMany({
    where: { id: { in: warehouseIds }, tenantId },
    select: { id: true },
  })
  const warehouseIdSet = new Set(warehouses.map((w) => w.id))

  const poItemIds = Array.from(new Set(input.items.map((i) => i.purchaseOrderItemId).filter((v): v is string => !!v)))
  const poItems = poItemIds.length
    ? await prisma.purchaseOrderItem.findMany({
        where: { id: { in: poItemIds }, purchaseOrder: { tenantId } },
        select: {
          id: true,
          itemId: true,
          purchaseOrderId: true,
          receivingInspections: { select: { acceptedQty: true } },
          materialReturnItems: { where: { materialReturn: { status: "COMPLETED" } }, select: { returnQty: true } },
        },
      })
    : []
  const poItemMap = new Map(poItems.map((p) => [p.id, p]))

  const lotIds = Array.from(new Set(input.items.map((i) => i.lotId).filter((v): v is string => !!v)))
  const lots = lotIds.length
    ? await prisma.lot.findMany({ where: { id: { in: lotIds }, tenantId }, select: { id: true, itemId: true } })
    : []
  const lotMap = new Map(lots.map((l) => [l.id, l]))

  const balances = await prisma.inventoryBalance.findMany({
    where: { tenantId, itemId: { in: itemIds }, warehouseId: { in: warehouseIds } },
    select: { itemId: true, warehouseId: true, lotId: true, qtyAvailable: true },
  })
  const balanceKey = (itemId: string, warehouseId: string, lotId: string | null) => `${itemId}::${warehouseId}::${lotId ?? ""}`
  const balanceMap = new Map(balances.map((b) => [balanceKey(b.itemId, b.warehouseId, b.lotId), Number(b.qtyAvailable)]))

  // purchaseOrderItemId 별 "이번 요청 내" 합산 — 같은 PO품목을 여러 줄에 나눠 입력한
  // 경우까지 함께 검증한다.
  const requestedByPoItem = new Map<string, number>()
  for (const it of input.items) {
    if (!it.purchaseOrderItemId) continue
    requestedByPoItem.set(it.purchaseOrderItemId, (requestedByPoItem.get(it.purchaseOrderItemId) ?? 0) + it.returnQty)
  }

  const validated: ValidatedItem[] = []
  for (const it of input.items) {
    assertPositiveQty(it.returnQty, "반품")

    const item = itemMap.get(it.itemId)
    if (!item) throw new Error("품목을 찾을 수 없습니다.")

    if (!warehouseIdSet.has(it.warehouseId)) throw new Error(`창고를 찾을 수 없습니다: ${item.code}`)

    if (item.isLotTracked) {
      if (!it.lotId) throw new Error(`LOT 관리 품목(${item.code})은 반품 시 LOT를 지정해야 합니다.`)
      const lot = lotMap.get(it.lotId)
      if (!lot || lot.itemId !== it.itemId) {
        throw new Error(`LOT가 올바르지 않습니다: ${item.code}`)
      }
    } else if (it.lotId) {
      throw new Error(`LOT 비관리 품목(${item.code})에는 LOT를 지정할 수 없습니다.`)
    }

    const qtyAvailable = balanceMap.get(balanceKey(it.itemId, it.warehouseId, it.lotId ?? null)) ?? 0
    if (it.returnQty > qtyAvailable) {
      throw new Error(`가용재고 부족: ${item.code} — 가용재고 ${qtyAvailable}, 반품 요청 ${it.returnQty}`)
    }

    if (it.purchaseOrderItemId) {
      const poItem = poItemMap.get(it.purchaseOrderItemId)
      if (!poItem || poItem.itemId !== it.itemId) {
        throw new Error(`선택한 발주품목이 올바르지 않습니다: ${item.code}`)
      }
      if (input.purchaseOrderId && poItem.purchaseOrderId !== input.purchaseOrderId) {
        throw new Error(`선택한 발주품목이 선택한 발주에 속하지 않습니다: ${item.code}`)
      }
      const acceptedQty = poItem.receivingInspections.reduce((s, r) => s + Number(r.acceptedQty), 0)
      const alreadyReturned = poItem.materialReturnItems.reduce((s, ri) => s + Number(ri.returnQty), 0)
      const requestedTotal = requestedByPoItem.get(it.purchaseOrderItemId) ?? it.returnQty
      if (alreadyReturned + requestedTotal > acceptedQty) {
        throw new Error(
          `PO 합격입고수량 초과: ${item.code} — 합격입고 ${acceptedQty}, 기완료반품 ${alreadyReturned}, 이번요청 ${requestedTotal}`
        )
      }
    }

    validated.push({ ...it, itemCode: item.code, isLotTracked: item.isLotTracked })
  }

  return validated
}

// ─── 등록 ───────────────────────────────────────────────────────────────────

export async function createMaterialReturn(
  input: MaterialReturnHeaderInput
): Promise<{ ok: boolean; error?: string; returnId?: string }> {
  try {
    const actor = await requireRole("OPERATOR")
    const tenantId = await getTenantId()

    await validateMaterialReturnInput(tenantId, input)

    let lastError: unknown = null
    for (let attempt = 0; attempt < CODE_GENERATION_MAX_ATTEMPTS; attempt++) {
      const returnNo = await generateMaterialReturnNo(tenantId)
      try {
        const created = await prisma.$transaction(async (tx) => {
          const materialReturn = await tx.materialReturn.create({
            data: {
              tenantId,
              supplierId: input.supplierId,
              purchaseOrderId: input.purchaseOrderId || null,
              returnNo,
              reason: input.reason?.trim() || null,
              note: input.note?.trim() || null,
              createdById: actor.id,
              items: {
                create: input.items.map((it) => ({
                  itemId: it.itemId,
                  purchaseOrderItemId: it.purchaseOrderItemId || null,
                  lotId: it.lotId || null,
                  warehouseId: it.warehouseId,
                  returnQty: it.returnQty,
                  note: it.note?.trim() || null,
                })),
              },
            },
          })

          await tx.auditLog.create({
            data: {
              tenantId,
              actorId: actor.id,
              actorLabel: actor.name,
              entityType: "MaterialReturn",
              entityId: materialReturn.id,
              action: "CREATE",
              afterData: {
                returnNo: materialReturn.returnNo,
                status: materialReturn.status,
                supplierId: materialReturn.supplierId,
                purchaseOrderId: materialReturn.purchaseOrderId,
                items: input.items,
              },
              menuName: MENU_NAME,
            },
          })

          return materialReturn
        })

        revalidateMaterialReturnPaths()
        return { ok: true, returnId: created.id }
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          lastError = e
          continue
        }
        throw e
      }
    }
    throw lastError instanceof Error ? lastError : new Error("반품번호 생성에 실패했습니다. 다시 시도해 주세요.")
  } catch (e) {
    return { ok: false, error: getErrorMessage(e) }
  }
}

// ─── 수정 (DRAFT만) ───────────────────────────────────────────────────────────

export async function updateMaterialReturn(
  id: string,
  input: MaterialReturnHeaderInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireRole("OPERATOR")
    const tenantId = await getTenantId()

    const current = await prisma.materialReturn.findFirst({
      where: { id, tenantId },
      include: { items: true },
    })
    if (!current) throw new Error("반품 건을 찾을 수 없습니다.")
    if (current.status !== "DRAFT") throw new Error("임시저장 상태의 반품만 수정할 수 있습니다.")

    await validateMaterialReturnInput(tenantId, input)

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.materialReturn.updateMany({
        where: { id: current.id, tenantId, status: "DRAFT" },
        data: {
          supplierId: input.supplierId,
          purchaseOrderId: input.purchaseOrderId || null,
          reason: input.reason?.trim() || null,
          note: input.note?.trim() || null,
        },
      })
      if (claimed.count !== 1) {
        throw new Error("다른 요청에 의해 상태가 이미 변경되었습니다. 새로고침 후 다시 시도해 주세요.")
      }

      await tx.materialReturnItem.deleteMany({ where: { materialReturnId: current.id } })
      await tx.materialReturnItem.createMany({
        data: input.items.map((it) => ({
          materialReturnId: current.id,
          itemId: it.itemId,
          purchaseOrderItemId: it.purchaseOrderItemId || null,
          lotId: it.lotId || null,
          warehouseId: it.warehouseId,
          returnQty: it.returnQty,
          note: it.note?.trim() || null,
        })),
      })

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actor.id,
          actorLabel: actor.name,
          entityType: "MaterialReturn",
          entityId: current.id,
          action: "UPDATE",
          beforeData: {
            supplierId: current.supplierId,
            purchaseOrderId: current.purchaseOrderId,
            items: current.items.map((i) => ({ itemId: i.itemId, warehouseId: i.warehouseId, lotId: i.lotId, returnQty: Number(i.returnQty) })),
          },
          afterData: {
            supplierId: input.supplierId,
            purchaseOrderId: input.purchaseOrderId || null,
            items: input.items,
          },
          menuName: MENU_NAME,
        },
      })
    })

    revalidateMaterialReturnPaths()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: getErrorMessage(e) }
  }
}

// ─── 삭제 (DRAFT만) ───────────────────────────────────────────────────────────

export async function deleteMaterialReturn(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireRole("OPERATOR")
    const tenantId = await getTenantId()

    const current = await prisma.materialReturn.findFirst({ where: { id, tenantId } })
    if (!current) throw new Error("반품 건을 찾을 수 없습니다.")
    if (current.status !== "DRAFT") throw new Error("임시저장 상태의 반품만 삭제할 수 있습니다.")

    await prisma.$transaction(async (tx) => {
      const deleted = await tx.materialReturn.deleteMany({ where: { id: current.id, tenantId, status: "DRAFT" } })
      if (deleted.count !== 1) {
        throw new Error("다른 요청에 의해 상태가 이미 변경되었습니다. 새로고침 후 다시 시도해 주세요.")
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actor.id,
          actorLabel: actor.name,
          entityType: "MaterialReturn",
          entityId: current.id,
          action: "DELETE",
          beforeData: { returnNo: current.returnNo, status: current.status },
          menuName: MENU_NAME,
        },
      })
    })

    revalidateMaterialReturnPaths()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: getErrorMessage(e) }
  }
}

// ─── 취소 (DRAFT → CANCELLED) ─────────────────────────────────────────────────

export async function cancelMaterialReturn(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireRole("OPERATOR")
    const tenantId = await getTenantId()

    const current = await prisma.materialReturn.findFirst({ where: { id, tenantId } })
    if (!current) throw new Error("반품 건을 찾을 수 없습니다.")
    if (current.status !== "DRAFT") throw new Error("임시저장 상태의 반품만 취소할 수 있습니다.")
    if (!MATERIAL_RETURN_STATUS_TRANSITIONS[current.status].includes("CANCELLED")) {
      throw new Error("현재 상태에서는 취소할 수 없습니다.")
    }

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.materialReturn.updateMany({
        where: { id: current.id, tenantId, status: "DRAFT" },
        data: { status: "CANCELLED" },
      })
      if (claimed.count !== 1) {
        throw new Error("다른 요청에 의해 상태가 이미 변경되었습니다. 새로고침 후 다시 시도해 주세요.")
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actor.id,
          actorLabel: actor.name,
          entityType: "MaterialReturn",
          entityId: current.id,
          action: "UPDATE",
          beforeData: { status: "DRAFT" },
          afterData: { status: "CANCELLED" },
          menuName: MENU_NAME,
        },
      })
    })

    revalidateMaterialReturnPaths()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: getErrorMessage(e) }
  }
}

// ─── 반품완료 (DRAFT → COMPLETED, 실제 재고차감) ──────────────────────────────
//
// §6: 반품완료 및 실제 재고차감은 MANAGER 이상만 수행할 수 있다. §5: COMPLETED
// 전환 시에만 InventoryBalance를 실제로 차감하고 InventoryTransaction(SUPPLIER_RETURN)을
// 생성한다. §8의 가용재고/PO 합격입고수량 검증을 트랜잭션 내에서 재확인해 DRAFT
// 저장 이후 벌어진 재고 변동/동시 반품완료 경쟁을 막는다. 완료 이후에는 수정·삭제·
// 취소를 전면 금지한다(상태전이표에도 COMPLETED는 terminal로 반영).

export async function completeMaterialReturn(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireRole("MANAGER")
    const tenantId = await getTenantId()

    const current = await prisma.materialReturn.findFirst({
      where: { id, tenantId },
      include: {
        items: {
          include: {
            item: { select: { id: true, code: true, isLotTracked: true } },
          },
        },
      },
    })
    if (!current) throw new Error("반품 건을 찾을 수 없습니다.")
    if (current.status !== "DRAFT") throw new Error("임시저장 상태의 반품만 완료 처리할 수 있습니다.")
    if (current.items.length === 0) throw new Error("반품 품목이 없습니다.")

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "")
    let txSeqBase = 0
    let lastError: unknown = null

    for (let attempt = 0; attempt < TXN_GENERATION_MAX_ATTEMPTS; attempt++) {
      txSeqBase = await prisma.inventoryTransaction.count({
        where: { tenantId, txNo: { startsWith: `SRT-${today}` } },
      })
      try {
        await prisma.$transaction(async (tx) => {
          const claimed = await tx.materialReturn.updateMany({
            where: { id: current.id, tenantId, status: "DRAFT" },
            data: { status: "COMPLETED", completedById: actor.id, completedAt: new Date() },
          })
          if (claimed.count !== 1) {
            throw new Error("다른 요청에 의해 상태가 이미 변경되었습니다. 새로고침 후 다시 시도해 주세요.")
          }

          const completedItemsLog: Array<{
            itemCode: string
            warehouseId: string
            lotId: string | null
            returnQty: number
            inventoryTransactionId: string
            txNo: string
          }> = []

          // PO품목별 "이번 완료 처리 중" 누적치 — 같은 PO품목을 이 반품 내 여러 줄에
          // 나눠 입력한 경우까지 합산한다. 위에서 이미 현재 MaterialReturn.status를
          // COMPLETED로 바꿔놓았기 때문에, 아래 DB 재검증 쿼리에서 materialReturnId
          // != current.id로 자기 자신(과 자기 자신의 다른 줄)을 제외해야 한다 — 그렇지
          // 않으면 방금 COMPLETED로 바뀐 자신의 줄이 "기완료반품"에 다시 잡혀 이중계산된다.
          const completedThisRunByPoItem = new Map<string, number>()

          for (let i = 0; i < current.items.length; i++) {
            const line = current.items[i]
            const returnQty = Number(line.returnQty)

            // ── 가용재고 재검증 (트랜잭션 내) ────────────────────────────────
            const balance = await tx.inventoryBalance.findFirst({
              where: { tenantId, itemId: line.itemId, warehouseId: line.warehouseId, lotId: line.lotId },
            })
            const qtyAvailable = balance ? Number(balance.qtyAvailable) : 0
            if (!balance || qtyAvailable < returnQty) {
              throw new Error(
                `가용재고 부족: ${line.item.code} — 가용재고 ${qtyAvailable}, 반품 요청 ${returnQty}`
              )
            }

            // ── PO 합격입고수량 재검증 (트랜잭션 내) ─────────────────────────
            if (line.purchaseOrderItemId) {
              const poItem = await tx.purchaseOrderItem.findUnique({
                where: { id: line.purchaseOrderItemId },
                select: {
                  receivingInspections: { select: { acceptedQty: true } },
                  materialReturnItems: {
                    where: { materialReturn: { status: "COMPLETED", id: { not: current.id } } },
                    select: { returnQty: true },
                  },
                },
              })
              const acceptedQty = poItem?.receivingInspections.reduce((s, r) => s + Number(r.acceptedQty), 0) ?? 0
              const otherCompletedReturned = poItem?.materialReturnItems.reduce((s, ri) => s + Number(ri.returnQty), 0) ?? 0
              const alreadyProcessedThisRun = completedThisRunByPoItem.get(line.purchaseOrderItemId) ?? 0
              const alreadyReturned = otherCompletedReturned + alreadyProcessedThisRun
              if (alreadyReturned + returnQty > acceptedQty) {
                throw new Error(
                  `PO 합격입고수량 초과: ${line.item.code} — 합격입고 ${acceptedQty}, 기완료반품 ${alreadyReturned}, 이번요청 ${returnQty}`
                )
              }
              completedThisRunByPoItem.set(line.purchaseOrderItemId, alreadyReturned + returnQty)
            }

            const txNo = `SRT-${today}-${String(txSeqBase + i + 1).padStart(4, "0")}`
            const inventoryTx = await tx.inventoryTransaction.create({
              data: {
                tenantId,
                itemId: line.itemId,
                lotId: line.lotId,
                fromLocationId: line.warehouseId,
                txNo,
                txType: "SUPPLIER_RETURN",
                qty: returnQty,
                refType: "MATERIAL_RETURN",
                refId: current.id,
                note: `공급사 반품 (${current.returnNo})`,
                txAt: new Date(),
              },
            })

            const newQtyOnHand = Number(balance.qtyOnHand) - returnQty
            if (newQtyOnHand < 0) {
              throw new Error(`재고 부족: ${line.item.code} — 현재 재고 ${Number(balance.qtyOnHand)}, 반품 요청 ${returnQty}`)
            }
            await tx.inventoryBalance.update({
              where: { id: balance.id },
              data: {
                qtyOnHand: newQtyOnHand,
                qtyAvailable: Math.max(0, newQtyOnHand - Number(balance.qtyHold)),
              },
            })

            await tx.materialReturnItem.update({
              where: { id: line.id },
              data: { inventoryTransactionId: inventoryTx.id },
            })

            completedItemsLog.push({
              itemCode: line.item.code,
              warehouseId: line.warehouseId,
              lotId: line.lotId,
              returnQty,
              inventoryTransactionId: inventoryTx.id,
              txNo,
            })
          }

          await tx.auditLog.create({
            data: {
              tenantId,
              actorId: actor.id,
              actorLabel: actor.name,
              entityType: "MaterialReturn",
              entityId: current.id,
              action: "UPDATE",
              beforeData: { status: "DRAFT" },
              afterData: { status: "COMPLETED", completedById: actor.id, items: completedItemsLog },
              menuName: MENU_NAME,
            },
          })
        })

        revalidateMaterialReturnPaths()
        return { ok: true }
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          lastError = e
          continue
        }
        throw e
      }
    }
    throw lastError instanceof Error ? lastError : new Error("반품 거래번호 생성에 실패했습니다. 다시 시도해 주세요.")
  } catch (e) {
    return { ok: false, error: getErrorMessage(e) }
  }
}
