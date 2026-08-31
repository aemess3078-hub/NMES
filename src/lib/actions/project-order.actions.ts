"use server"

import { prisma } from "@/lib/db/prisma"
import { ProjectOrderStatus, ProjectOrderPriority, Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { requireRole, getTenantId } from "@/lib/auth"
import { getErrorMessage } from "@/lib/utils"

// ─── 청운커팅 사업계획서 "영업관리 > 프로젝트 오더" ────────────────────────────────
//
// 수주(SalesOrder)와 생산실행 사이를 잇는 프로젝트 단위 업무 Header.
// 프로젝트 진행률/단계관리/이슈관리/대금관리는 이 파일의 책임이 아니다(PR #48+).
// 모든 조회/등록/수정/삭제 액션은 클라이언트가 넘긴 tenantId를 신뢰하지 않고
// getTenantId()로 세션에서 직접 구한다.

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
  deliveryDate: Date
  firstItemId: string | null
}

export async function getProjectOrderSalesOrders(): Promise<ProjectOrderSalesOrderOption[]> {
  const tenantId = await getTenantId()
  const orders = await prisma.salesOrder.findMany({
    where: { tenantId },
    select: {
      id: true,
      orderNo: true,
      customerId: true,
      deliveryDate: true,
      items: { select: { itemId: true }, orderBy: { itemId: "asc" }, take: 1 },
    },
    orderBy: { orderNo: "desc" },
  })
  return orders.map((o) => ({
    id: o.id,
    orderNo: o.orderNo,
    customerId: o.customerId,
    deliveryDate: o.deliveryDate,
    firstItemId: o.items[0]?.itemId ?? null,
  }))
}

// ─── 번호 생성 (기존 SalesOrder/PurchaseOrder/Quotation과 동일한 패턴) ────────────
//
// prefix+findFirst desc 방식은 sibling 영업관리 모델들의 기존 관례를 따른 것이다.
// 별도 NumberingSequence 테이블(numbering-rule.actions.ts)은 현재 LOT/SERIAL
// 채번 전용이라 이번 PR에서 새 타입을 얹어 재사용하지 않는다 — sibling 모델과의
// 일관성을 우선했다. 대신 동시 등록 시 발생할 수 있는 unique 충돌은
// createProjectOrder에서 재시도로 방어한다(§5).

export async function generateProjectOrderNo(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `PROJ-${year}-`
  const last = await prisma.projectOrder.findFirst({
    where: { tenantId, code: { startsWith: prefix } },
    orderBy: { code: "desc" },
    select: { code: true },
  })
  const seq = last ? (parseInt(last.code.split("-")[2] ?? "0", 10) || 0) + 1 : 1
  return `${prefix}${String(seq).padStart(3, "0")}`
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

async function assertTenantScopedReferences(
  tenantId: string,
  input: { customerId: string; ownerId: string; itemId?: string | null; salesOrderId?: string | null }
) {
  const [customer, owner] = await Promise.all([
    prisma.businessPartner.findFirst({ where: { id: input.customerId, tenantId }, select: { id: true } }),
    prisma.tenantUser.findFirst({ where: { profileId: input.ownerId, tenantId }, select: { profileId: true } }),
  ])
  if (!customer) throw new Error("거래처를 찾을 수 없습니다.")
  if (!owner) throw new Error("담당자를 찾을 수 없습니다.")

  if (input.itemId) {
    const item = await prisma.item.findFirst({ where: { id: input.itemId, tenantId }, select: { id: true } })
    if (!item) throw new Error("품목을 찾을 수 없습니다.")
  }
  if (input.salesOrderId) {
    const salesOrder = await prisma.salesOrder.findFirst({
      where: { id: input.salesOrderId, tenantId },
      select: { id: true },
    })
    if (!salesOrder) throw new Error("연결할 수주를 찾을 수 없습니다.")
  }
}

export async function createProjectOrder(
  input: CreateProjectOrderInput
): Promise<{ ok: boolean; error?: string; projectOrderId?: string }> {
  try {
    const actor = await requireRole("OPERATOR")
    const tenantId = await getTenantId()

    const name = input.name.trim()
    if (!name) throw new Error("프로젝트명을 입력해 주세요.")

    await assertTenantScopedReferences(tenantId, input)

    const site = await prisma.site.findFirst({ where: { tenantId }, select: { id: true } })
    if (!site) throw new Error("사업장을 찾을 수 없습니다.")

    let lastError: unknown = null
    for (let attempt = 0; attempt < CODE_GENERATION_MAX_ATTEMPTS; attempt++) {
      const code = await generateProjectOrderNo(tenantId)
      try {
        const projectOrder = await prisma.$transaction(async (tx) => {
          const created = await tx.projectOrder.create({
            data: {
              tenantId,
              siteId: site.id,
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

    if (input.customerId || input.ownerId || input.itemId !== undefined || input.salesOrderId !== undefined) {
      await assertTenantScopedReferences(tenantId, {
        customerId: input.customerId ?? current.customerId,
        ownerId: input.ownerId ?? current.ownerId,
        itemId: input.itemId !== undefined ? input.itemId : current.itemId,
        salesOrderId: input.salesOrderId !== undefined ? input.salesOrderId : current.salesOrderId,
      })
    }

    const name = input.name?.trim()
    if (input.name !== undefined && !name) throw new Error("프로젝트명을 입력해 주세요.")

    await prisma.$transaction(async (tx) => {
      const updated = await tx.projectOrder.update({
        where: { id: current.id },
        data: {
          ...(name !== undefined && { name }),
          ...(input.customerId !== undefined && { customerId: input.customerId }),
          ...(input.ownerId !== undefined && { ownerId: input.ownerId }),
          ...(input.status !== undefined && { status: input.status }),
          ...(input.priority !== undefined && { priority: input.priority }),
          ...(input.itemId !== undefined && { itemId: input.itemId || null }),
          ...(input.salesOrderId !== undefined && { salesOrderId: input.salesOrderId || null }),
          ...(input.plannedStartDate !== undefined && { plannedStartDate: input.plannedStartDate }),
          ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
          ...(input.description !== undefined && { description: input.description?.trim() || null }),
        },
      })

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
