"use server"

import { prisma } from "@/lib/db/prisma"

// ─── 의료기기 제조번호 추적성 ────────────────────────────────────────────────
//
// 제조번호(manufacturingNo) 기준으로
//   - 작업지시
//   - 품목
//   - 투입 원자재 LOT
//   - 공정 진행 이력
//   - 검사 결과
//   - 포장 / 완제품 입고
//   - 출고
// 를 하나의 트리로 묶어 반환한다.
//
// 아직 데이터가 없는 구간은 null 또는 빈 배열로 반환하여
// 추적성 화면이 한결같은 구조로 데이터를 다룰 수 있도록 한다.

export type TraceabilityMaterialLot = {
  materialItemId: string
  materialCode: string | null
  materialName: string | null
  materialSpec: string | null
  lotNo: string
  qty: number
  unit: string | null
  issuedAt: Date
}

export type TraceabilityProcessHistory = {
  operationId: string
  seq: number
  processName: string
  status: string
  startedAt: Date | null
  completedAt: Date | null
  workerName: string | null
  goodQty: number
  defectQty: number
  note: string | null
}

export type TraceabilityInspection = {
  id: string
  processName: string
  stage: string
  result: string | null
  inspectedQty: number
  inspectedAt: Date
  inspectorName: string | null
}

export type TraceabilityPackaging = {
  warehouseName: string | null
  locationName: string | null
  receiptQty: number
  receiptAt: Date
} | null

export type TraceabilityShipment = {
  shipmentNo: string
  status: string
  plannedDate: Date
  shippedDate: Date | null
  qty: number
}

export type ManufacturingTraceability = {
  manufacturingNo: string
  workOrder: {
    id: string
    orderNo: string
    status: string
    plannedQty: number
    item: {
      id: string
      code: string
      name: string
      spec: string | null
      uom: string
    }
  } | null
  materialLots: TraceabilityMaterialLot[]
  processHistory: TraceabilityProcessHistory[]
  inspections: TraceabilityInspection[]
  packaging: TraceabilityPackaging
  finishedGoodsReceipt: TraceabilityPackaging
  shipments: TraceabilityShipment[]
}

export async function getManufacturingTraceability(
  manufacturingNo: string,
  tenantId: string,
): Promise<ManufacturingTraceability | null> {
  const trimmed = manufacturingNo.trim()
  if (!trimmed) return null

  const workOrder = await prisma.workOrder.findFirst({
    where: { tenantId, manufacturingNo: trimmed },
    include: {
      item: {
        select: { id: true, code: true, name: true, spec: true, uom: true },
      },
      operations: {
        orderBy: { seq: "asc" },
        include: {
          routingOperation: { select: { name: true } },
          productionResults: {
            orderBy: { startedAt: "asc" },
            select: {
              startedAt: true,
              endedAt: true,
              goodQty: true,
              defectQty: true,
            },
          },
          qualityInspections: {
            orderBy: { inspectedAt: "asc" },
            include: {
              inspectionSpec: {
                include: {
                  routingOperation: { select: { name: true } },
                },
              },
              inspector: { select: { name: true } },
            },
          },
        },
      },
      finishedGoodsReceipts: {
        orderBy: { receiptAt: "asc" },
        include: {
          warehouse: { select: { name: true } },
          location: { select: { name: true } },
        },
      },
    },
  })

  if (!workOrder) {
    return {
      manufacturingNo: trimmed,
      workOrder: null,
      materialLots: [],
      processHistory: [],
      inspections: [],
      packaging: null,
      finishedGoodsReceipt: null,
      shipments: [],
    }
  }

  // 투입 원자재 LOT
  const materialLotRows = await prisma.workOrderMaterialLot.findMany({
    where: { tenantId, workOrderId: workOrder.id },
    include: {
      materialItem: {
        select: { id: true, code: true, name: true, spec: true },
      },
    },
    orderBy: { issuedAt: "asc" },
  })

  const materialLots: TraceabilityMaterialLot[] = materialLotRows.map((row) => ({
    materialItemId: row.materialItemId,
    materialCode: row.materialItem?.code ?? null,
    materialName: row.materialItem?.name ?? null,
    materialSpec: row.materialItem?.spec ?? null,
    lotNo: row.materialLotNo,
    qty: Number(row.qty),
    unit: row.unit,
    issuedAt: row.issuedAt,
  }))

  // 공정 진행 이력
  const processHistory: TraceabilityProcessHistory[] = workOrder.operations.map((op) => {
    const totalGood = op.productionResults.reduce(
      (s, r) => s + Number(r.goodQty),
      0,
    )
    const totalDefect = op.productionResults.reduce(
      (s, r) => s + Number(r.defectQty),
      0,
    )
    const startedAt = op.productionResults.find((r) => r.startedAt)?.startedAt ?? null
    const completedAt = [...op.productionResults]
      .reverse()
      .find((r) => r.endedAt)?.endedAt ?? null

    return {
      operationId: op.id,
      seq: op.seq,
      processName: op.routingOperation.name,
      status: op.status,
      startedAt,
      completedAt,
      workerName: null,
      goodQty: totalGood,
      defectQty: totalDefect,
      note: null,
    }
  })

  // 검사 결과 (모든 공정 검사 합산)
  const inspections: TraceabilityInspection[] = workOrder.operations.flatMap((op) =>
    op.qualityInspections.map((qi) => ({
      id: qi.id,
      processName: qi.inspectionSpec.routingOperation.name,
      stage: qi.stage,
      result: qi.result,
      inspectedQty: Number(qi.inspectedQty),
      inspectedAt: qi.inspectedAt,
      inspectorName: qi.inspector?.name ?? null,
    })),
  )

  // 완제품 입고 (= 포장/입고 정보의 출처) — 최근 1건을 대표값으로
  const latestReceipt = workOrder.finishedGoodsReceipts[workOrder.finishedGoodsReceipts.length - 1]
  const packagingInfo: TraceabilityPackaging = latestReceipt
    ? {
        warehouseName: latestReceipt.warehouse?.name ?? null,
        locationName: latestReceipt.location?.name ?? null,
        receiptQty: Number(latestReceipt.receiptQty),
        receiptAt: latestReceipt.receiptAt,
      }
    : null

  // 출고: 같은 LOT가 출고된 ShipmentItem 검색
  // 작업지시의 완제품 입고 LOT를 거쳐 추적
  const finishedLotIds = workOrder.finishedGoodsReceipts
    .map((r) => r.lotId)
    .filter((id): id is string => id != null)

  let shipments: TraceabilityShipment[] = []
  if (finishedLotIds.length > 0) {
    const shipmentItems = await prisma.shipmentItem.findMany({
      where: {
        lotId: { in: finishedLotIds },
        shipmentOrder: { tenantId },
      },
      include: {
        shipmentOrder: {
          select: {
            shipmentNo: true,
            status: true,
            plannedDate: true,
            shippedDate: true,
          },
        },
      },
      orderBy: { shipmentOrder: { plannedDate: "asc" } },
    })

    shipments = shipmentItems.map((si) => ({
      shipmentNo: si.shipmentOrder.shipmentNo,
      status: si.shipmentOrder.status,
      plannedDate: si.shipmentOrder.plannedDate,
      shippedDate: si.shipmentOrder.shippedDate,
      qty: Number(si.qty),
    }))
  }

  return {
    manufacturingNo: trimmed,
    workOrder: {
      id: workOrder.id,
      orderNo: workOrder.orderNo,
      status: workOrder.status,
      plannedQty: Number(workOrder.plannedQty),
      item: {
        id: workOrder.item.id,
        code: workOrder.item.code,
        name: workOrder.item.name,
        spec: workOrder.item.spec,
        uom: workOrder.item.uom,
      },
    },
    materialLots,
    processHistory,
    inspections,
    packaging: packagingInfo,
    finishedGoodsReceipt: packagingInfo,
    shipments,
  }
}

// 제조번호 자동완성 / 목록 조회용 (옵션)
export async function listManufacturingNos(
  tenantId: string,
  search?: string,
): Promise<{ manufacturingNo: string; orderNo: string; itemName: string }[]> {
  const rows = await prisma.workOrder.findMany({
    where: {
      tenantId,
      manufacturingNo: search
        ? { contains: search, mode: "insensitive" }
        : { not: null },
    },
    select: {
      manufacturingNo: true,
      orderNo: true,
      item: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  return rows
    .filter((r): r is typeof r & { manufacturingNo: string } => r.manufacturingNo != null)
    .map((r) => ({
      manufacturingNo: r.manufacturingNo,
      orderNo: r.orderNo,
      itemName: r.item.name,
    }))
}
