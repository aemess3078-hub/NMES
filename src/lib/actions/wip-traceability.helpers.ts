import { Prisma, WipUnitStatus } from "@prisma/client"

// pop.actions.ts 트랜잭션 내부에서만 호출되는 내부 헬퍼.
// 직접 호출되는 Server Action이 아니므로 "use server" 미사용.

export type WipTraceabilityTx = Prisma.TransactionClient

const REUSABLE_WIP_STATUSES: WipUnitStatus[] = [
  WipUnitStatus.WAITING,
  WipUnitStatus.IN_PROCESS,
  WipUnitStatus.ON_HOLD,
  WipUnitStatus.OUTSOURCED,
  WipUnitStatus.IN_TRANSIT,
  WipUnitStatus.RECEIVED,
  WipUnitStatus.REWORK,
]

export async function findActiveWipUnitForWorkOrder(
  tx: WipTraceabilityTx,
  params: { tenantId: string; workOrderId: string }
) {
  return tx.wipUnit.findFirst({
    where: {
      tenantId: params.tenantId,
      workOrderId: params.workOrderId,
      parentWipUnitId: null,
      sourceProductionResultId: null,
      status: { in: REUSABLE_WIP_STATUSES },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  })
}

export async function transitionWipUnitOnStart(
  tx: WipTraceabilityTx,
  params: {
    tenantId: string
    siteId: string | null
    workOrderId: string
    operationId: string
    workCenterId: string | null
    createdById?: string | null
  }
): Promise<void> {
  const wipUnit = await findActiveWipUnitForWorkOrder(tx, {
    tenantId: params.tenantId,
    workOrderId: params.workOrderId,
  })

  if (!wipUnit) {
    console.warn(
      `[wip-traceability] WipUnit not found for workOrderId=${params.workOrderId} on startOperation, skipping WIP sync`
    )
    return
  }

  // 멱등 처리: 이미 같은 공정에서 IN_PROCESS면 추가 기록 없음
  if (
    wipUnit.status === WipUnitStatus.IN_PROCESS &&
    wipUnit.workOrderOperationId === params.operationId
  ) {
    return
  }

  await tx.wipUnit.update({
    where: { id: wipUnit.id },
    data: {
      status: WipUnitStatus.IN_PROCESS,
      workOrderOperationId: params.operationId,
      currentWorkCenterId: params.workCenterId,
    },
  })

  await tx.wipMovement.create({
    data: {
      tenantId: params.tenantId,
      siteId: params.siteId,
      wipUnitId: wipUnit.id,
      movementType: "STARTED",
      fromOperationId: null,
      toOperationId: params.operationId,
      fromWorkCenterId: null,
      toWorkCenterId: params.workCenterId,
      qty: wipUnit.qty,
      sourceType: "WorkOrderOperation",
      sourceId: params.operationId,
      note: "POP 작업시작",
      createdById: params.createdById ?? null,
    },
  })
}

export async function advanceWipUnitOnOperationComplete(
  tx: WipTraceabilityTx,
  params: {
    tenantId: string
    siteId: string | null
    workOrderId: string
    completedOperationId: string
    completedWorkCenterId: string | null
    nextOperation: {
      id: string
      routingOperation: { workCenterId: string }
    } | null
    productionResultId: string
    createdById?: string | null
  }
): Promise<void> {
  const wipUnit = await findActiveWipUnitForWorkOrder(tx, {
    tenantId: params.tenantId,
    workOrderId: params.workOrderId,
  })

  if (!wipUnit) {
    console.warn(
      `[wip-traceability] WipUnit not found for workOrderId=${params.workOrderId} on operation complete, skipping WIP sync`
    )
    return
  }

  if (params.nextOperation) {
    await tx.wipUnit.update({
      where: { id: wipUnit.id },
      data: {
        status: WipUnitStatus.WAITING,
        workOrderOperationId: params.nextOperation.id,
        currentWorkCenterId: params.nextOperation.routingOperation.workCenterId,
      },
    })

    await tx.wipMovement.create({
      data: {
        tenantId: params.tenantId,
        siteId: params.siteId,
        wipUnitId: wipUnit.id,
        movementType: "MOVED",
        fromOperationId: params.completedOperationId,
        toOperationId: params.nextOperation.id,
        fromWorkCenterId: params.completedWorkCenterId,
        toWorkCenterId: params.nextOperation.routingOperation.workCenterId,
        qty: wipUnit.qty,
        sourceType: "ProductionResult",
        sourceId: params.productionResultId,
        note: "공정 완료에 따른 이동",
        createdById: params.createdById ?? null,
      },
    })
    return
  }

  // 마지막 공정 완료: workOrderOperationId/currentWorkCenterId는 그대로 유지하고 status만 COMPLETED
  await tx.wipUnit.update({
    where: { id: wipUnit.id },
    data: {
      status: WipUnitStatus.COMPLETED,
    },
  })

  await tx.wipMovement.create({
    data: {
      tenantId: params.tenantId,
      siteId: params.siteId,
      wipUnitId: wipUnit.id,
      movementType: "COMPLETED",
      fromOperationId: params.completedOperationId,
      toOperationId: null,
      fromWorkCenterId: params.completedWorkCenterId,
      toWorkCenterId: null,
      qty: wipUnit.qty,
      sourceType: "ProductionResult",
      sourceId: params.productionResultId,
      note: "마지막 공정 완료",
      createdById: params.createdById ?? null,
    },
  })
}
