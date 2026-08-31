"use server"

import { prisma } from "@/lib/db/prisma"
import { ProjectOrderStatus, ProjectOrderPriority, Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { requireRole, getTenantId } from "@/lib/auth"
import { getErrorMessage } from "@/lib/utils"
import { toKstDateKey } from "@/lib/date/kst"
import {
  PROJECT_ORDER_STATUS_TRANSITIONS,
  PROJECT_ORDER_CREATABLE_STATUSES,
} from "@/lib/project-order-status"

// ─── 청운커팅 사업계획서 "영업관리 > 프로젝트 오더" ────────────────────────────────
//
// 수주(SalesOrder)와 생산실행 사이를 잇는 프로젝트 단위 업무 Header.
// 프로젝트 진행률/단계관리/이슈관리/대금관리는 이 파일의 책임이 아니다(PR #48+).
// 모든 조회/등록/수정/삭제 액션은 클라이언트가 넘긴 tenantId를 신뢰하지 않고
// getTenantId()로 세션에서 직접 구한다. 채번 함수는 client tenantId를 받는
// 공개 Server Action으로 만들지 않고 파일 내부 helper로만 둔다(§3).

const MENU_NAME = "프로젝트 오더"
const DELETABLE_STATUSES: ProjectOrderStatus[] = ["DRAFT"]
const CODE_GENERATION_MAX_ATTEMPTS = 3

function revalidateProjectOrderPaths() {
  revalidatePath("/app/mes/project-orders")
}

// ─── 조회 ───────────────────────────────────────────────────────────────────

export type ProjectOrderRow = {
  id: string
  code: string
  name: string
  siteId: string
  priority: ProjectOrderPriority
  status: ProjectOrderStatus
  plannedStartDate: Date | null
  dueDate: Date | null
  description: string | null
  createdAt: Date
  updatedAt: Date
  customer: { id: string; code: string; name: string }
  item: { id: string; code: string; name: string } | null
  salesOrder: { id: string; orderNo: string } | null
  owner: { id: string; name: string }
}

export async function getProjectOrders(): Promise<ProjectOrderRow[]> {
  const tenantId = await getTenantId()
  return prisma.projectOrder.findMany({
    where: { tenantId },
    select: {
      id: true,
      code: true,
      name: true,
      siteId: true,
      priority: true,
      status: true,
      plannedStartDate: true,
      dueDate: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      customer: { select: { id: true, code: true, name: true } },
      item: { select: { id: true, code: true, name: true } },
      salesOrder: { select: { id: true, orderNo: true } },
      owner: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  })
}

export async function getProjectOrderCustomers() {
  const tenantId = await getTenantId()
  return prisma.businessPartner.findMany({
    where: { tenantId, partnerType: { in: ["CUSTOMER", "BOTH"] } },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  })
}

export async function getProjectOrderItems() {
  const tenantId = await getTenantId()
  return prisma.item.findMany({
    where: { tenantId, status: "ACTIVE" },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  })
}

export async function getProjectOrderAssignableUsers() {
  const tenantId = await getTenantId()
  const users = await prisma.tenantUser.findMany({
    where: { tenantId, isActive: true },
    select: { profileId: true, profile: { select: { name: true } } },
  })
  return users.map((u) => ({ id: u.profileId, name: u.profile.name }))
}

export type ProjectOrderSalesOrderOption = {
  id: string
  orderNo: string
  customerId: string
  siteId: string
  deliveryDate: Date
  items: { id: string; code: string; name: string }[]
}

// 연결 수주 선택지 — CANCELLED 수주는 애초에 연결 대상에서 제외한다(§2).
// siteId도 함께 내려준다 — 수정 모드에서는 현재 ProjectOrder.siteId와 같은
// 수주만 고르게 해서 연결 시점에 사업장 불일치가 아예 발생하지 않도록 한다
// (최종 검증은 여전히 updateProjectOrder 서버에서 한다).
export async function getProjectOrderSalesOrders(): Promise<ProjectOrderSalesOrderOption[]> {
  const tenantId = await getTenantId()
  const orders = await prisma.salesOrder.findMany({
    where: { tenantId, status: { not: "CANCELLED" } },
    select: {
      id: true,
      orderNo: true,
      customerId: true,
      siteId: true,
      deliveryDate: true,
      items: {
        select: { item: { select: { id: true, code: true, name: true } } },
        orderBy: { item: { code: "asc" } },
      },
    },
    orderBy: { orderNo: "desc" },
  })
  return orders.map((o) => ({
    id: o.id,
    orderNo: o.orderNo,
    customerId: o.customerId,
    siteId: o.siteId,
    deliveryDate: o.deliveryDate,
    items: o.items.map((i) => i.item),
  }))
}

// ─── 번호 생성 (내부 전용, Server Action으로 export하지 않음) ───────────────────
//
// prefix+findFirst desc 방식은 sibling 영업관리 모델들(SalesOrder/PurchaseOrder/
// Quotation)의 기존 관례를 따른 것이다. 별도 NumberingSequence 테이블은 현재
// LOT/SERIAL 채번 전용이라 이번 PR에서 새 타입을 얹어 재사용하지 않는다 — sibling
// 모델과의 일관성을 우선했다. 동시 등록 시 unique 충돌은 createProjectOrder에서
// 재시도로 방어한다. 연도는 UTC가 아니라 KST 달력일 기준으로 계산한다(§3) —
// 자정 직후 UTC 연도가 아직 안 넘어간 KST 새해에도 올바른 prefix가 나오도록.

async function generateProjectOrderNo(tenantId: string): Promise<string> {
  const kstYear = toKstDateKey(new Date()).slice(0, 4)
  const prefix = `PROJ-${kstYear}-`
  const last = await prisma.projectOrder.findFirst({
    where: { tenantId, code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  })
  const seq = last ? (parseInt(last.code.split("-")[2] ?? "0", 10) || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(3, "0")}`
}

// ─── 참조값 검증 (§6) ───────────────────────────────────────────────────────
//
// client select 목록만 믿지 않고, UI 필터와 동일한 조건(거래처 partnerType,
// 담당자 isActive, 품목 status)을 서버에서도 매번 다시 확인한다.
// salesOrderId가 있으면 tenant/취소여부/거래처 일치/품목 포함여부까지 검증한다
// (siteId는 여기서 다루지 않는다 — 생성 시에만 resolveCreateSiteId로 별도 결정).

async function assertReferencesValid(
  tenantId: string,
  input: { customerId: string; ownerId: string; itemId?: string | null; salesOrderId?: string | null }
): Promise<void> {
  const [customer, owner] = await Promise.all([
    prisma.businessPartner.findFirst({
      where: { id: input.customerId, tenantId, partnerType: { in: ["CUSTOMER", "BOTH"] } },
      select: { id: true },
    }),
    prisma.tenantUser.findFirst({
      where: { profileId: input.ownerId, tenantId, isActive: true },
      select: { profileId: true },
    }),
  ])
  if (!customer) throw new Error("거래처를 찾을 수 없습니다.")
  if (!owner) throw new Error("담당자를 찾을 수 없습니다. 활성 상태인 담당자만 지정할 수 있습니다.")

  if (input.itemId) {
    const item = await prisma.item.findFirst({
      where: { id: input.itemId, tenantId, status: "ACTIVE" },
      select: { id: true },
    })
    if (!item) throw new Error("품목을 찾을 수 없습니다.")
  }

  if (input.salesOrderId) {
    const salesOrder = await prisma.salesOrder.findFirst({
      where: { id: input.salesOrderId, tenantId },
      select: {
        status: true,
        customerId: true,
        items: { select: { itemId: true } },
      },
    })
    if (!salesOrder) throw new Error("연결할 수주를 찾을 수 없습니다.")
    if (salesOrder.status === "CANCELLED") throw new Error("취소된 수주는 연결할 수 없습니다.")
    if (salesOrder.customerId !== input.customerId) {
      throw new Error("연결한 수주의 거래처와 일치하지 않습니다.")
    }
    if (input.itemId && !salesOrder.items.some((i) => i.itemId === input.itemId)) {
      throw new Error("선택한 품목이 연결된 수주의 품목 목록에 없습니다.")
    }
  }
}

function assertDateOrder(plannedStartDate: Date | null, dueDate: Date | null) {
  if (plannedStartDate && dueDate && plannedStartDate.getTime() > dueDate.getTime()) {
    throw new Error("시작 예정일은 납기 예정일보다 늦을 수 없습니다.")
  }
}

// ─── siteId 결정 (생성 시에만, §1) ──────────────────────────────────────────
//
// 절대 tenant의 Site를 findFirst로 임의 선택하지 않는다. 우선순위:
// 1) 연결 수주가 있으면 그 SalesOrder.siteId
// 2) 없으면 현재 로그인 사용자의 TenantUser.siteId(있는 경우)
// 3) 그것도 없고 tenant의 Site가 정확히 1개면 그 site
// 4) 그래도 결정 불가하면(다중 사업장 + 신호 없음) 임의 선택 대신 명확한 오류를
//    반환한다 — 기존 NMES의 모든 등록 화면(수주/구매/입고 등)이 사업장 선택
//    UI 없이 sites[0]을 암묵적으로 쓰는 것과 달리, 여기서는 그 임의성을
//    없애는 것이 이번 보완의 목적이므로 새 UI를 추가하는 대신 안전하게 막는다.

async function resolveCreateSiteId(
  tenantId: string,
  actorProfileId: string,
  salesOrderId?: string | null
): Promise<string> {
  if (salesOrderId) {
    const salesOrder = await prisma.salesOrder.findFirst({
      where: { id: salesOrderId, tenantId },
      select: { siteId: true },
    })
    if (salesOrder) return salesOrder.siteId
  }

  const tenantUser = await prisma.tenantUser.findFirst({
    where: { profileId: actorProfileId, tenantId, isActive: true },
    select: { siteId: true },
  })
  if (tenantUser?.siteId) return tenantUser.siteId

  const sites = await prisma.site.findMany({ where: { tenantId }, select: { id: true }, take: 2 })
  if (sites.length === 1) return sites[0].id

  throw new Error(
    "사업장을 결정할 수 없습니다. 연결할 수주를 먼저 선택하거나, 계정에 사업장을 설정한 뒤 다시 시도해 주세요."
  )
}

// ─── 등록 ───────────────────────────────────────────────────────────────────

export type CreateProjectOrderInput = {
  name: string
  customerId: string
  ownerId: string
  status: ProjectOrderStatus
  priority?: ProjectOrderPriority
  itemId?: string | null
  salesOrderId?: string | null
  plannedStartDate?: Date | null
  dueDate?: Date | null
  description?: string | null
}

export async function createProjectOrder(
  input: CreateProjectOrderInput
): Promise<{ ok: boolean; error?: string; projectOrderId?: string }> {
  try {
    const actor = await requireRole("OPERATOR")
    const tenantId = await getTenantId()

    const name = input.name.trim()
    if (!name) throw new Error("프로젝트명을 입력해 주세요.")

    if (!PROJECT_ORDER_CREATABLE_STATUSES.includes(input.status)) {
      throw new Error("신규 등록 시에는 초안 또는 수주확정 상태로만 시작할 수 있습니다.")
    }

    await assertReferencesValid(tenantId, input)
    assertDateOrder(input.plannedStartDate ?? null, input.dueDate ?? null)

    const siteId = await resolveCreateSiteId(tenantId, actor.id, input.salesOrderId)

    let lastError: unknown = null
    for (let attempt = 0; attempt < CODE_GENERATION_MAX_ATTEMPTS; attempt++) {
      const code = await generateProjectOrderNo(tenantId)
      try {
        const projectOrder = await prisma.$transaction(async (tx) => {
          const created = await tx.projectOrder.create({
            data: {
              tenantId,
              siteId,
              code,
              name,
              customerId: input.customerId,
              itemId: input.itemId || null,
              salesOrderId: input.salesOrderId || null,
              ownerId: input.ownerId,
              priority: input.priority ?? "MEDIUM",
              status: input.status,
              plannedStartDate: input.plannedStartDate ?? null,
              dueDate: input.dueDate ?? null,
              description: input.description?.trim() || null,
            },
          })

          await tx.auditLog.create({
            data: {
              tenantId,
              actorId: actor.id,
              actorLabel: actor.name,
              entityType: "ProjectOrder",
              entityId: created.id,
              action: "CREATE",
              afterData: {
                code: created.code,
                name: created.name,
                customerId: created.customerId,
                status: created.status,
                priority: created.priority,
              },
              menuName: MENU_NAME,
            },
          })

          return created
        })

        revalidateProjectOrderPaths()
        return { ok: true, projectOrderId: projectOrder.id }
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          lastError = e
          continue
        }
        throw e
      }
    }
    throw lastError instanceof Error ? lastError : new Error("프로젝트 오더번호 생성에 실패했습니다. 다시 시도해 주세요.")
  } catch (e) {
    return { ok: false, error: getErrorMessage(e) }
  }
}

// ─── 수정 ───────────────────────────────────────────────────────────────────

export type UpdateProjectOrderInput = {
  id: string
  name?: string
  customerId?: string
  ownerId?: string
  status?: ProjectOrderStatus
  priority?: ProjectOrderPriority
  itemId?: string | null
  salesOrderId?: string | null
  plannedStartDate?: Date | null
  dueDate?: Date | null
  description?: string | null
}

export async function updateProjectOrder(
  input: UpdateProjectOrderInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireRole("OPERATOR")
    const tenantId = await getTenantId()

    const current = await prisma.projectOrder.findFirst({ where: { id: input.id, tenantId } })
    if (!current) throw new Error("프로젝트 오더를 찾을 수 없습니다.")

    const effectiveSalesOrderId =
      input.salesOrderId !== undefined ? input.salesOrderId : current.salesOrderId

    if (input.customerId || input.ownerId || input.itemId !== undefined || input.salesOrderId !== undefined) {
      await assertReferencesValid(tenantId, {
        customerId: input.customerId ?? current.customerId,
        ownerId: input.ownerId ?? current.ownerId,
        itemId: input.itemId !== undefined ? input.itemId : current.itemId,
        salesOrderId: effectiveSalesOrderId,
      })
    }

    // ProjectOrder 생성 이후 siteId는 자동 변경하지 않는다 — 연결(변경)하려는
    // 수주가 현재 ProjectOrder.siteId와 다른 사업장이면 차단한다. 존재/tenant
    // 검증은 위 assertReferencesValid가 이미 했으므로 여기서는 siteId만 본다.
    if (effectiveSalesOrderId) {
      const linkedSalesOrder = await prisma.salesOrder.findFirst({
        where: { id: effectiveSalesOrderId, tenantId },
        select: { siteId: true },
      })
      if (linkedSalesOrder && linkedSalesOrder.siteId !== current.siteId) {
        throw new Error("다른 사업장의 수주는 연결할 수 없습니다.")
      }
    }

    const nextPlannedStartDate =
      input.plannedStartDate !== undefined ? input.plannedStartDate : current.plannedStartDate
    const nextDueDate = input.dueDate !== undefined ? input.dueDate : current.dueDate
    assertDateOrder(nextPlannedStartDate, nextDueDate)

    const name = input.name?.trim()
    if (input.name !== undefined && !name) throw new Error("프로젝트명을 입력해 주세요.")

    // 상태전이 검증(§4) — 서버가 최종 판단한다. 상태를 바꾸는 경우에만 현재
    // 상태를 조건으로 건 updateMany로 동시 변경을 방어한다(WipHold와 동일한
    // claim 패턴).
    const isStatusChange = input.status !== undefined && input.status !== current.status
    if (isStatusChange) {
      const allowed = PROJECT_ORDER_STATUS_TRANSITIONS[current.status]
      if (!allowed.includes(input.status as ProjectOrderStatus)) {
        throw new Error(
          `현재 상태(${current.status})에서 ${input.status} 상태로 변경할 수 없습니다.`
        )
      }
    }

    // updateMany(상태변경 시 concurrency guard)와 update가 같은 data 모양을 쓸 수
    // 있도록 relation connect/disconnect 대신 scalar FK 필드를 직접 대입한다 —
    // updateMany의 data는 ProjectOrderUpdateManyMutationInput이라 relation 문법을
    // 받지 않는다.
    await prisma.$transaction(async (tx) => {
      const updateData: Prisma.ProjectOrderUpdateManyMutationInput = {
        ...(name !== undefined && { name }),
        ...(input.customerId !== undefined && { customerId: input.customerId }),
        ...(input.ownerId !== undefined && { ownerId: input.ownerId }),
        ...(input.priority !== undefined && { priority: input.priority }),
        ...(input.itemId !== undefined && { itemId: input.itemId || null }),
        ...(input.salesOrderId !== undefined && { salesOrderId: input.salesOrderId || null }),
        ...(input.plannedStartDate !== undefined && { plannedStartDate: input.plannedStartDate }),
        ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
        ...(input.description !== undefined && { description: input.description?.trim() || null }),
      }

      let updated
      if (isStatusChange) {
        const claimed = await tx.projectOrder.updateMany({
          where: { id: current.id, tenantId, status: current.status },
          data: { ...updateData, status: input.status },
        })
        if (claimed.count !== 1) {
          throw new Error("다른 요청에 의해 상태가 이미 변경되었습니다. 새로고침 후 다시 시도해 주세요.")
        }
        updated = await tx.projectOrder.findUniqueOrThrow({ where: { id: current.id } })
      } else {
        updated = await tx.projectOrder.update({ where: { id: current.id }, data: updateData })
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actor.id,
          actorLabel: actor.name,
          entityType: "ProjectOrder",
          entityId: updated.id,
          action: "UPDATE",
          beforeData: {
            name: current.name,
            customerId: current.customerId,
            ownerId: current.ownerId,
            status: current.status,
            priority: current.priority,
            itemId: current.itemId,
            salesOrderId: current.salesOrderId,
            plannedStartDate: current.plannedStartDate,
            dueDate: current.dueDate,
          },
          afterData: {
            name: updated.name,
            customerId: updated.customerId,
            ownerId: updated.ownerId,
            status: updated.status,
            priority: updated.priority,
            itemId: updated.itemId,
            salesOrderId: updated.salesOrderId,
            plannedStartDate: updated.plannedStartDate,
            dueDate: updated.dueDate,
          },
          menuName: MENU_NAME,
        },
      })
    })

    revalidateProjectOrderPaths()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: getErrorMessage(e) }
  }
}

// ─── 삭제 ───────────────────────────────────────────────────────────────────
//
// 기존 SalesOrder/Quotation과 동일하게 하드 삭제이되 DRAFT 상태에서만 허용한다(§11).
// 향후 ProjectStage/ProjectIssue/ProductionPlan/WorkOrder가 이 엔티티를 참조할
// 예정이므로, DRAFT 상태 가드 자체가 "아직 후속 참조가 생기기 전에만 삭제 가능"이라는
// 안전장치 역할을 한다 — 별도 isDeleted 플래그나 참조 카운트 조회는 이번 PR에서
// 만들지 않는다.

export async function deleteProjectOrder(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const actor = await requireRole("OPERATOR")
    const tenantId = await getTenantId()

    const current = await prisma.projectOrder.findFirst({ where: { id, tenantId } })
    if (!current) throw new Error("프로젝트 오더를 찾을 수 없습니다.")
    if (!DELETABLE_STATUSES.includes(current.status)) {
      throw new Error("DRAFT 상태인 프로젝트 오더만 삭제할 수 있습니다.")
    }

    await prisma.$transaction(async (tx) => {
      const deleted = await tx.projectOrder.deleteMany({
        where: { id: current.id, tenantId, status: { in: DELETABLE_STATUSES } },
      })
      if (deleted.count !== 1) {
        throw new Error("다른 요청에 의해 상태가 이미 변경되었습니다. 새로고침 후 다시 시도해 주세요.")
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: actor.id,
          actorLabel: actor.name,
          entityType: "ProjectOrder",
          entityId: current.id,
          action: "DELETE",
          beforeData: { code: current.code, name: current.name, status: current.status },
          menuName: MENU_NAME,
        },
      })
    })

    revalidateProjectOrderPaths()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: getErrorMessage(e) }
  }
}
