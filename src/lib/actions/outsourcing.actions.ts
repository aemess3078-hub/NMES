"use server"

import { prisma } from "@/lib/db/prisma"
import { getTenantId, requireRole } from "@/lib/auth"
import { Prisma, PurchaseOrderStatus, ReceivingInspectionResult } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { randomBytes } from "crypto"

// ─── Filter & Types ───────────────────────────────────────────────────────────

export type OutsourcingFilter = {
  from?: string  // YYYY-MM-DD
  to?: string
  supplierId?: string
  status?: PurchaseOrderStatus
}

export type OutsourcingOrderRow = {
  id: string
  orderNo: string
  orderDate: string
  expectedDate: string
  supplierName: string
  supplierId: string
  status: PurchaseOrderStatus
  totalAmount: number | null
  itemCount: number
  itemSummary: string
  firstItemCode: string | null
  totalQty: number
  totalReceivedQty: number
  isOverdue: boolean
  note: string | null
}

export type OutsourcingReceivingRow = {
  id: string
  inspectedAt: string
  orderNo: string
  supplierName: string
  itemCode: string
  itemName: string
  receivedQty: number
  acceptedQty: number
  rejectedQty: number
  result: ReceivingInspectionResult
}

export type OutsourcingSummary = {
  totalOrders: number
  pendingOrders: number
  partialReceived: number
  completed: number
  overdue: number
}

export type OutsourcingWipUnitRow = {
  id: string
  mfgNo: string
  itemCode: string
  itemName: string
  qty: number
  partnerName: string
  processName: string
  wipStatus: "OUTSOURCED" | "RECEIVED"
}

export type OutsourcingAvailableWipUnitRow = {
  id: string
  mfgNo: string
  itemCode: string
  itemName: string
  qty: number
  workOrderNo: string
  operationSeq: number
}

export type OutsourcingWipReceivingRow = {
  id: string
  createdAt: string
  mfgNo: string
  itemCode: string
  itemName: string
  qty: number
  partnerName: string
  note: string | null
}

export type OutsourcingData = {
  filter: OutsourcingFilter
  summary: OutsourcingSummary
  orders: OutsourcingOrderRow[]
  receivings: OutsourcingReceivingRow[]
  wipUnits: OutsourcingWipUnitRow[]
  availableWipUnits: OutsourcingAvailableWipUnitRow[]
  wipReceivingHistory: OutsourcingWipReceivingRow[]
  partners: { id: string; name: string }[]
  recentProcessNames: string[]
}

// ─── 타입 ────────────────────────────────────────────────────────────────────

export type CreateOutsourcingOrderInput = {
  supplierId: string
  outsourcingProcessName: string
  expectedDate?: string  // YYYY-MM-DD
  note?: string
}

export type IssueWipUnitToOutsourcingInput = {
  wipUnitId: string
  outsourcingOrderId: string
}

export type ReceiveWipUnitFromOutsourcingInput = {
  wipUnitId: string
  note?: string
}

export type InspectOutsourcedWipUnitInput = {
  wipUnitId: string
  acceptedQty: number
  defectQty: number
  reworkQty: number
  note?: string
}

export type InspectOutsourcedWipUnitResult = {
  success: true
  updatedWipUnitId: string
  createdDefectWipUnitId?: string
  createdReworkWipUnitId?: string
  message: string
}

// ─── 발주 생성 ────────────────────────────────────────────────────────────────

function generateOutsourcingOrderNo(): string {
  const now = new Date()
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "")
  const hhmmss = now.toISOString().slice(11, 19).replace(/:/g, "")
  const random = randomBytes(2).toString("hex").toUpperCase().slice(0, 4)
  return `OS-${yyyymmdd}-${hhmmss}-${random}`
}

export async function createOutsourcingOrder(data: CreateOutsourcingOrderInput) {
  await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  const supplier = await prisma.businessPartner.findUniqueOrThrow({
    where: { id: data.supplierId },
  })
  if (supplier.tenantId !== tenantId) {
    throw new Error("선택한 외주처를 찾을 수 없습니다.")
  }

  const orderNo = generateOutsourcingOrderNo()
  const now = new Date()
  const note = `[OUTSOURCING] ${data.outsourcingProcessName}${data.note ? `\n${data.note}` : ""}`

  const order = await prisma.purchaseOrder.create({
    data: {
      tenantId,
      orderNo,
      supplierId: data.supplierId,
      siteId: (await prisma.site.findFirst({ where: { tenantId } }))?.id || "",
      status: "ORDERED",
      orderDate: now,
      expectedDate: data.expectedDate
        ? new Date(`${data.expectedDate}T00:00:00.000`)
        : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      note,
    },
  })

  revalidatePath("/app/mes/production/outsourcing")
  return order
}

// ─── WipUnit 외주출고 ──────────────────────────────────────────────────────────

export async function issueWipUnitToOutsourcing(data: IssueWipUnitToOutsourcingInput) {
  await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  const wipUnit = await prisma.wipUnit.findUniqueOrThrow({
    where: { id: data.wipUnitId },
    include: { workOrderOperation: true },
  })
  if (wipUnit.tenantId !== tenantId) {
    throw new Error("작업 WIP을 찾을 수 없습니다.")
  }

  if (wipUnit.status === "OUTSOURCED") {
    throw new Error("이미 외주 처리된 작업입니다.")
  }

  const purchaseOrder = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: data.outsourcingOrderId },
    include: { supplier: true },
  })
  if (purchaseOrder.tenantId !== tenantId) {
    throw new Error("외주발주를 찾을 수 없습니다.")
  }

  await prisma.$transaction(async (tx) => {
    await tx.wipUnit.update({
      where: { id: data.wipUnitId },
      data: {
        status: "OUTSOURCED",
        outsourcingPartnerId: purchaseOrder.supplierId,
      },
    })

    await tx.wipMovement.create({
      data: {
        tenantId,
        wipUnitId: data.wipUnitId,
        movementType: "OUTSOURCED",
        toPartnerId: purchaseOrder.supplierId,
        sourceType: "PurchaseOrder",
        sourceId: data.outsourcingOrderId,
        qty: wipUnit.qty,
        note: `외주출고: ${purchaseOrder.supplier.name} - 공정순서 ${wipUnit.workOrderOperation.seq} - 제조번호: ${wipUnit.manufacturingNo || "-"}`,
      },
    })
  })

  revalidatePath("/app/mes/production/outsourcing")
  revalidatePath("/app/mes/production/wip-inventory")
  revalidatePath("/app/mes/manufacturing-traceability")
}

// ─── WipUnit 외주입고 ──────────────────────────────────────────────────────────

export async function receiveWipUnitFromOutsourcing(data: ReceiveWipUnitFromOutsourcingInput) {
  await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  const wipUnit = await prisma.wipUnit.findUniqueOrThrow({
    where: { id: data.wipUnitId },
  })
  if (wipUnit.tenantId !== tenantId) {
    throw new Error("작업 WIP을 찾을 수 없습니다.")
  }

  if (wipUnit.status !== "OUTSOURCED") {
    throw new Error("외주 처리되지 않은 작업입니다.")
  }

  if (!wipUnit.outsourcingPartnerId) {
    throw new Error("외주처 정보가 없습니다.")
  }

  const supplier = await prisma.businessPartner.findUniqueOrThrow({
    where: { id: wipUnit.outsourcingPartnerId },
  })

  // TODO: OS-2 UI에서 purchaseOrderId를 명시적으로 입력받도록 개선
  // 현재는 같은 외주처의 최신 외주발주를 임시로 연결
  // 향후: IssueWipUnitToOutsourcingInput에 outsourcingOrderId를 추가하고,
  //      receiveWipUnitFromOutsourcingInput에도 outsourcingOrderId 추가
  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: {
      tenantId,
      supplierId: wipUnit.outsourcingPartnerId,
      note: { contains: "[OUTSOURCING]" },
      orderDate: {
        gte: new Date(new Date().getTime() - 90 * 24 * 60 * 60 * 1000),
      },
    },
  })

  await prisma.$transaction(async (tx) => {
    await tx.wipUnit.update({
      where: { id: data.wipUnitId },
      data: {
        status: "RECEIVED",
        outsourcingPartnerId: null,
      },
    })

    await tx.wipMovement.create({
      data: {
        tenantId,
        wipUnitId: data.wipUnitId,
        movementType: "RETURNED",
        fromPartnerId: wipUnit.outsourcingPartnerId,
        sourceType: "PurchaseOrder",
        sourceId: purchaseOrder?.id || "",
        qty: wipUnit.qty,
        note: `외주입고/검사대기: ${supplier.name} - 제조번호: ${wipUnit.manufacturingNo || "-"}${data.note ? ` - ${data.note}` : ""}`,
      },
    })
  })

  revalidatePath("/app/mes/production/outsourcing")
  revalidatePath("/app/mes/production/wip-inventory")
  revalidatePath("/app/mes/manufacturing-traceability")
}

export async function inspectOutsourcedWipUnit(
  input: InspectOutsourcedWipUnitInput
): Promise<InspectOutsourcedWipUnitResult> {
  await requireRole("OPERATOR")
  const tenantId = await getTenantId()

  // 1. WipUnit 조회 및 테넌트 검증
  const wipUnit = await prisma.wipUnit.findUniqueOrThrow({
    where: { id: input.wipUnitId },
  })
  if (wipUnit.tenantId !== tenantId) {
    throw new Error("재공을 찾을 수 없습니다.")
  }

  // 2. 상태 검증: RECEIVED만 허용
  if (wipUnit.status !== "RECEIVED") {
    throw new Error("입고검사 대기(RECEIVED) 상태의 재공만 검사처리할 수 있습니다.")
  }

  // 3. 수량 검증
  const { acceptedQty, defectQty, reworkQty } = input
  if (acceptedQty < 0 || defectQty < 0 || reworkQty < 0) {
    throw new Error("수량은 0 이상이어야 합니다.")
  }
  const totalInput = acceptedQty + defectQty + reworkQty
  if (totalInput === 0) {
    throw new Error("검사 수량을 입력해주세요.")
  }
  const wipQty = Number(wipUnit.qty)
  if (Math.abs(totalInput - wipQty) > 0.000001) {
    throw new Error(
      `검사 수량 합계(${totalInput})가 재공 수량(${wipQty})과 일치해야 합니다.`
    )
  }

  // 4. 중복 검사처리 방지 (이미 OutsourcingInspection sourceType 이동이 있으면 처리됨)
  const existingInspection = await prisma.wipMovement.findFirst({
    where: {
      tenantId,
      wipUnitId: input.wipUnitId,
      sourceType: "OutsourcingInspection",
    },
    select: { id: true },
  })
  if (existingInspection) {
    throw new Error("이미 검사처리된 재공입니다.")
  }

  // 5. siteId 조회
  const site = await prisma.site.findFirst({ where: { tenantId } })
  const siteId = site?.id ?? null

  let createdDefectWipUnitId: string | undefined
  let createdReworkWipUnitId: string | undefined

  await prisma.$transaction(async (tx) => {
    const movements: Prisma.WipMovementCreateManyInput[] = []

    // ── 합격분: 부모 WipUnit 복귀 ────────────────────────────────────────────
    //   acceptedQty=0이면 부모는 qty=0 / SCRAPPED (배치 전량 불합격)
    const parentNewStatus = acceptedQty > 0 ? "IN_PROCESS" : "SCRAPPED"
    await tx.wipUnit.update({
      where: { id: input.wipUnitId },
      data: { status: parentNewStatus, qty: acceptedQty },
    })

    if (acceptedQty > 0) {
      movements.push({
        tenantId,
        siteId,
        wipUnitId: input.wipUnitId,
        movementType: "RELEASED",
        qty: acceptedQty,
        sourceType: "OutsourcingInspection",
        sourceId: input.wipUnitId,
        note: `외주검사 합격 복귀${input.note ? ` - ${input.note}` : ""} (합격=${acceptedQty})`,
      })
    }

    // ── 불량분: SCRAPPED 자식 WipUnit 생성 ──────────────────────────────────
    if (defectQty > 0) {
      const defectChild = await tx.wipUnit.create({
        data: {
          tenantId,
          siteId: wipUnit.siteId,
          workOrderId: wipUnit.workOrderId,
          workOrderOperationId: wipUnit.workOrderOperationId,
          itemId: wipUnit.itemId,
          lotId: wipUnit.lotId,
          manufacturingNo: wipUnit.manufacturingNo,
          currentWorkCenterId: wipUnit.currentWorkCenterId,
          currentWarehouseId: wipUnit.currentWarehouseId,
          currentLocationId: wipUnit.currentLocationId,
          parentWipUnitId: input.wipUnitId,
          qty: defectQty,
          status: "SCRAPPED",
        },
      })
      createdDefectWipUnitId = defectChild.id

      movements.push(
        {
          tenantId,
          siteId,
          wipUnitId: input.wipUnitId,
          relatedWipUnitId: defectChild.id,
          movementType: "DEFECT",
          qty: defectQty,
          sourceType: "OutsourcingInspection",
          sourceId: input.wipUnitId,
          note: `외주검사 불량${input.note ? ` - ${input.note}` : ""} (불량=${defectQty})`,
        },
        {
          tenantId,
          siteId,
          wipUnitId: input.wipUnitId,
          relatedWipUnitId: defectChild.id,
          movementType: "SPLIT",
          qty: defectQty,
          sourceType: "OutsourcingInspection",
          sourceId: input.wipUnitId,
          note: `외주검사 불량 수량 분리 (defectQty=${defectQty})`,
        }
      )
    }

    // ── 재외주분: REWORK 자식 WipUnit 생성 ──────────────────────────────────
    if (reworkQty > 0) {
      const reworkChild = await tx.wipUnit.create({
        data: {
          tenantId,
          siteId: wipUnit.siteId,
          workOrderId: wipUnit.workOrderId,
          workOrderOperationId: wipUnit.workOrderOperationId,
          itemId: wipUnit.itemId,
          lotId: wipUnit.lotId,
          manufacturingNo: wipUnit.manufacturingNo,
          currentWorkCenterId: wipUnit.currentWorkCenterId,
          currentWarehouseId: wipUnit.currentWarehouseId,
          currentLocationId: wipUnit.currentLocationId,
          parentWipUnitId: input.wipUnitId,
          qty: reworkQty,
          status: "REWORK",
        },
      })
      createdReworkWipUnitId = reworkChild.id

      movements.push(
        {
          tenantId,
          siteId,
          wipUnitId: input.wipUnitId,
          relatedWipUnitId: reworkChild.id,
          movementType: "REWORK",
          qty: reworkQty,
          sourceType: "OutsourcingInspection",
          sourceId: input.wipUnitId,
          note: `외주검사 재외주 대상${input.note ? ` - ${input.note}` : ""} (재외주=${reworkQty})`,
        },
        {
          tenantId,
          siteId,
          wipUnitId: input.wipUnitId,
          relatedWipUnitId: reworkChild.id,
          movementType: "SPLIT",
          qty: reworkQty,
          sourceType: "OutsourcingInspection",
          sourceId: input.wipUnitId,
          note: `외주검사 재외주 수량 분리 (reworkQty=${reworkQty})`,
        }
      )
    }

    await tx.wipMovement.createMany({ data: movements })
  })

  revalidatePath("/app/mes/production/outsourcing")
  revalidatePath("/app/mes/production/wip-inventory")
  revalidatePath("/app/mes/manufacturing-traceability")

  return {
    success: true,
    updatedWipUnitId: input.wipUnitId,
    createdDefectWipUnitId,
    createdReworkWipUnitId,
    message: `검사처리 완료: 합격 ${acceptedQty}, 불량 ${defectQty}, 재외주 ${reworkQty}`,
  }
}

// ─── 조회 ─────────────────────────────────────────────────────────────────────

export async function getOutsourcingData(
  filter: OutsourcingFilter = {}
): Promise<OutsourcingData> {
  const tenantId = await getTenantId()
  const now = new Date()

  const from = filter.from ? new Date(`${filter.from}T00:00:00.000`) : undefined
  const to = filter.to ? new Date(`${filter.to}T23:59:59.999`) : undefined

  // ── 발주 목록 (외주발주만 필터링: OS- 접두어 또는 [OUTSOURCING] 태그) ───────
  const orders = await prisma.purchaseOrder.findMany({
    where: {
      tenantId,
      OR: [
        { orderNo: { startsWith: "OS-" } },
        { note: { contains: "[OUTSOURCING]" } },
      ],
      ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(from || to
        ? { orderDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    include: {
      supplier: { select: { id: true, name: true } },
      items: {
        select: {
          qty: true,
          receivedQty: true,
          unitPrice: true,
          item: { select: { code: true, name: true } },
        },
      },
    },
    orderBy: { orderDate: "desc" },
  })

  const orderRows: OutsourcingOrderRow[] = orders.map((o) => {
    const totalQty = o.items.reduce((s, i) => s + Number(i.qty), 0)
    const totalReceivedQty = o.items.reduce((s, i) => s + Number(i.receivedQty), 0)
    const calculatedAmount = o.items.reduce(
      (sum, item) => sum + Number(item.qty) * Number(item.unitPrice),
      0
    )
    const firstItem = o.items[0]?.item
    const itemSummary = firstItem
      ? o.items.length > 1
        ? `${firstItem.name} 외 ${o.items.length - 1}건`
        : firstItem.name
      : "-"
    const totalAmount =
      o.totalAmount !== null ? Number(o.totalAmount) : Math.round(calculatedAmount)
    const isOverdue =
      (o.status === "ORDERED" || o.status === "PARTIAL_RECEIVED") &&
      o.expectedDate < now
    return {
      id: o.id,
      orderNo: o.orderNo,
      orderDate: o.orderDate.toISOString(),
      expectedDate: o.expectedDate.toISOString(),
      supplierName: o.supplier.name,
      supplierId: o.supplier.id,
      status: o.status,
      totalAmount,
      itemCount: o.items.length,
      itemSummary,
      firstItemCode: firstItem?.code ?? null,
      totalQty: Math.round(totalQty * 100) / 100,
      totalReceivedQty: Math.round(totalReceivedQty * 100) / 100,
      isOverdue,
      note: o.note,
    }
  })

  // ── 입고 이력 (외주발주 기반, OS- 또는 [OUTSOURCING] 태그) ─────────────────
  const receivings = await prisma.receivingInspection.findMany({
    where: {
      purchaseOrderItem: {
        purchaseOrder: {
          tenantId,
          OR: [
            { orderNo: { startsWith: "OS-" } },
            { note: { contains: "[OUTSOURCING]" } },
          ],
          ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
        },
      },
      ...(from || to
        ? {
            inspectedAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    include: {
      purchaseOrderItem: {
        include: {
          item: { select: { code: true, name: true } },
          purchaseOrder: {
            select: { orderNo: true, supplier: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { inspectedAt: "desc" },
    take: 200,
  })

  const receivingRows: OutsourcingReceivingRow[] = receivings.map((r) => ({
    id: r.id,
    inspectedAt: r.inspectedAt.toISOString(),
    orderNo: r.purchaseOrderItem.purchaseOrder.orderNo,
    supplierName: r.purchaseOrderItem.purchaseOrder.supplier.name,
    itemCode: r.purchaseOrderItem.item.code,
    itemName: r.purchaseOrderItem.item.name,
    receivedQty: Number(r.receivedQty),
    acceptedQty: Number(r.acceptedQty),
    rejectedQty: Number(r.rejectedQty),
    result: r.result,
  }))

  // ── 공급처 목록 ───────────────────────────────────────────────────────────────
  const partners = await prisma.businessPartner.findMany({
    where: { tenantId, partnerType: { in: ["SUPPLIER", "BOTH"] }, status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  // ── 외주 중인 WipUnit (OUTSOURCED: 외주진행중, RECEIVED: 입고검사대기) ────────
  const outsourcedWipUnits = await prisma.wipUnit.findMany({
    where: {
      tenantId,
      status: { in: ["OUTSOURCED", "RECEIVED"] },
    },
    include: {
      item: { select: { code: true, name: true } },
      outsourcingPartner: { select: { name: true } },
      workOrderOperation: true,
    },
    orderBy: { createdAt: "desc" },
  })

  const wipUnitRows: OutsourcingWipUnitRow[] = outsourcedWipUnits.map((w) => ({
    id: w.id,
    mfgNo: w.manufacturingNo || "-",
    itemCode: w.item.code,
    itemName: w.item.name,
    qty: Number(w.qty),
    partnerName: w.outsourcingPartner?.name || "-",
    processName: `공정순서 ${w.workOrderOperation.seq}`,
    wipStatus: w.status as "OUTSOURCED" | "RECEIVED",
  }))

  // ── 출고 가능한 WipUnit (IN_PROCESS / WAITING) ──────────────────────────────
  const availableWipUnitsData = await prisma.wipUnit.findMany({
    where: {
      tenantId,
      status: { in: ["IN_PROCESS", "WAITING"] },
    },
    include: {
      item: { select: { code: true, name: true } },
      workOrder: { select: { orderNo: true } },
      workOrderOperation: { select: { seq: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  })

  const availableWipUnitRows: OutsourcingAvailableWipUnitRow[] = availableWipUnitsData.map((w) => ({
    id: w.id,
    mfgNo: w.manufacturingNo || "-",
    itemCode: w.item.code,
    itemName: w.item.name,
    qty: Number(w.qty),
    workOrderNo: w.workOrder?.orderNo || "-",
    operationSeq: w.workOrderOperation.seq,
  }))

  // ── 외주입고 이력 (WipMovement RETURNED) ─────────────────────────────────────
  const wipReceivingHistoryData = await prisma.wipMovement.findMany({
    where: {
      tenantId,
      movementType: "RETURNED",
    },
    include: {
      wipUnit: {
        include: { item: { select: { code: true, name: true } } },
      },
      fromPartner: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  })

  const wipReceivingHistoryRows: OutsourcingWipReceivingRow[] = wipReceivingHistoryData.map((m) => ({
    id: m.id,
    createdAt: m.createdAt.toISOString(),
    mfgNo: m.wipUnit.manufacturingNo || "-",
    itemCode: m.wipUnit.item.code,
    itemName: m.wipUnit.item.name,
    qty: Number(m.qty),
    partnerName: m.fromPartner?.name || "-",
    note: m.note,
  }))

  // ── 최근 외주공정명 (datalist 후보용) ─────────────────────────────────────────
  const recentProcessNames = Array.from(
    new Set(
      orders
        .map((o) => {
          if (!o.note) return null
          const match = o.note.match(/\[OUTSOURCING\] ([^\n]+)/)
          return match ? match[1].trim() : null
        })
        .filter((n): n is string => n !== null)
    )
  ).slice(0, 10)

  // ── 요약 ─────────────────────────────────────────────────────────────────────
  const pendingOrders = orderRows.filter(
    (o) => o.status === "DRAFT" || o.status === "ORDERED"
  ).length
  const partialReceived = orderRows.filter((o) => o.status === "PARTIAL_RECEIVED").length
  const completed = orderRows.filter(
    (o) => o.status === "RECEIVED" || o.status === "CLOSED"
  ).length
  const overdue = orderRows.filter((o) => o.isOverdue).length

  return {
    filter,
    summary: {
      totalOrders: orderRows.length,
      pendingOrders,
      partialReceived,
      completed,
      overdue,
    },
    orders: orderRows,
    receivings: receivingRows,
    wipUnits: wipUnitRows,
    availableWipUnits: availableWipUnitRows,
    wipReceivingHistory: wipReceivingHistoryRows,
    partners: partners.map((p) => ({ id: p.id, name: p.name })),
    recentProcessNames,
  }
}
