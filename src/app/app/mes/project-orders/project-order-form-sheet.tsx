"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"

import { Form, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FormSheet } from "@/components/common/form-sheet/form-sheet"
import { projectOrderFormSchema, ProjectOrderFormValues } from "./project-order-form-schema"
import { createProjectOrder, updateProjectOrder } from "@/lib/actions/project-order.actions"
import { ProjectOrderStatus, ProjectOrderPriority } from "@prisma/client"
import type { ProjectOrderRow } from "./columns"

// ─── Types ────────────────────────────────────────────────────────────────────

type CustomerOption = { id: string; code: string; name: string }
type ItemOption = { id: string; code: string; name: string }
type UserOption = { id: string; name: string }
type SalesOrderOption = {
  id: string
  orderNo: string
  customerId: string
  deliveryDate: Date | string
  firstItemId: string | null
}

interface ProjectOrderFormSheetProps {
  mode: "create" | "edit"
  projectOrder?: ProjectOrderRow | null
  customers: CustomerOption[]
  items: ItemOption[]
  users: UserOption[]
  salesOrders: SalesOrderOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { label: string; value: ProjectOrderStatus }[] = [
  { label: "초안", value: "DRAFT" },
  { label: "수주확정", value: "CONFIRMED" },
  { label: "진행중", value: "IN_PROGRESS" },
  { label: "보류", value: "ON_HOLD" },
  { label: "완료", value: "COMPLETED" },
  { label: "취소", value: "CANCELLED" },
]

const PRIORITY_OPTIONS: { label: string; value: ProjectOrderPriority }[] = [
  { label: "낮음", value: "LOW" },
  { label: "보통", value: "MEDIUM" },
  { label: "높음", value: "HIGH" },
]

const NONE_VALUE = "__none__"

const DEFAULT_VALUES: ProjectOrderFormValues = {
  name: "",
  customerId: "",
  ownerId: "",
  status: "DRAFT",
  priority: "MEDIUM",
  itemId: "",
  salesOrderId: "",
  plannedStartDate: "",
  dueDate: "",
  description: "",
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProjectOrderFormSheet({
  mode,
  projectOrder,
  customers,
  items,
  users,
  salesOrders,
  open,
  onOpenChange,
}: ProjectOrderFormSheetProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const form = useForm<ProjectOrderFormValues>({
    resolver: zodResolver(projectOrderFormSchema),
    defaultValues: DEFAULT_VALUES,
  })

  // ─── create 모드 초기화 ──────────────────────────────────────────────────────

  useEffect(() => {
    if (mode === "create" && open) {
      form.reset(DEFAULT_VALUES)
    }
  }, [mode, open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── edit 모드 초기화 ────────────────────────────────────────────────────────

  useEffect(() => {
    if (mode === "edit" && projectOrder && open) {
      form.reset({
        name: projectOrder.name,
        customerId: projectOrder.customer.id,
        ownerId: projectOrder.owner.id,
        status: projectOrder.status,
        priority: projectOrder.priority,
        itemId: projectOrder.item?.id ?? "",
        salesOrderId: projectOrder.salesOrder?.id ?? "",
        plannedStartDate: projectOrder.plannedStartDate
          ? new Date(projectOrder.plannedStartDate).toISOString().split("T")[0]
          : "",
        dueDate: projectOrder.dueDate
          ? new Date(projectOrder.dueDate).toISOString().split("T")[0]
          : "",
        description: projectOrder.description ?? "",
      })
    }
  }, [mode, projectOrder, open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 연결 수주 선택 시 거래처/납기일/품목 자동 제안 (§12) ─────────────────────
  // 사용자가 이후 직접 값을 바꿀 수 있다 — 자동 동기화가 아니라 최초 제안일 뿐이다.

  function handleSalesOrderChange(salesOrderId: string) {
    form.setValue("salesOrderId", salesOrderId === NONE_VALUE ? "" : salesOrderId)
    if (salesOrderId === NONE_VALUE) return
    const so = salesOrders.find((s) => s.id === salesOrderId)
    if (!so) return
    if (!form.getValues("customerId")) form.setValue("customerId", so.customerId)
    if (!form.getValues("dueDate")) {
      form.setValue("dueDate", new Date(so.deliveryDate).toISOString().split("T")[0])
    }
    if (!form.getValues("itemId") && so.firstItemId) form.setValue("itemId", so.firstItemId)
  }

  // ─── 저장 핸들러 ────────────────────────────────────────────────────────────

  async function onSubmit(values: ProjectOrderFormValues) {
    setIsLoading(true)
    try {
      const payload = {
        name: values.name,
        customerId: values.customerId,
        ownerId: values.ownerId,
        status: values.status,
        priority: values.priority,
        itemId: values.itemId || null,
        salesOrderId: values.salesOrderId || null,
        plannedStartDate: values.plannedStartDate ? new Date(values.plannedStartDate) : null,
        dueDate: values.dueDate ? new Date(values.dueDate) : null,
        description: values.description || null,
      }

      const result =
        mode === "create"
          ? await createProjectOrder(payload)
          : await updateProjectOrder({ id: projectOrder!.id, ...payload })

      if (!result.ok) {
        alert(result.error ?? "저장 중 오류가 발생했습니다.")
        return
      }

      onOpenChange(false)
      router.refresh()
    } catch (error) {
      console.error("저장 실패:", error)
      alert(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.")
    } finally {
      setIsLoading(false)
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      mode={mode}
      title={mode === "create" ? "프로젝트 오더 등록" : "프로젝트 오더 수정"}
      description={
        mode === "create"
          ? "새로운 프로젝트 오더를 등록합니다. 오더번호는 자동으로 채번됩니다."
          : "프로젝트 오더 정보를 수정합니다."
      }
      isLoading={isLoading}
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <Form {...form}>
        <div className="space-y-4">
          {/* 프로젝트명 */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>프로젝트명</FormLabel>
                <Input placeholder="프로젝트명을 입력하세요" {...field} />
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 거래처 */}
          <FormField
            control={form.control}
            name="customerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>거래처</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || undefined}>
                  <SelectTrigger>
                    <SelectValue placeholder="거래처 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        [{c.code}] {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            {/* 담당자 */}
            <FormField
              control={form.control}
              name="ownerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>담당자</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || undefined}>
                    <SelectTrigger>
                      <SelectValue placeholder="담당자 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 우선순위 */}
            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>우선순위</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* 상태 */}
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>상태</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 연결 수주 */}
          <FormField
            control={form.control}
            name="salesOrderId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>연결 수주 (선택)</FormLabel>
                <Select
                  onValueChange={handleSalesOrderChange}
                  value={field.value || NONE_VALUE}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="연결할 수주 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>연결 안 함</SelectItem>
                    {salesOrders.map((so) => (
                      <SelectItem key={so.id} value={so.id}>
                        {so.orderNo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 품목/모델 */}
          <FormField
            control={form.control}
            name="itemId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>품목/모델 (선택)</FormLabel>
                <Select
                  onValueChange={(v) => field.onChange(v === NONE_VALUE ? "" : v)}
                  value={field.value || NONE_VALUE}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="품목 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>선택 안 함</SelectItem>
                    {items.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        [{item.code}] {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            {/* 시작 예정일 */}
            <FormField
              control={form.control}
              name="plannedStartDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>시작 예정일 (선택)</FormLabel>
                  <Input type="date" {...field} value={field.value ?? ""} />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 납기 예정일 */}
            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>납기 예정일 (선택)</FormLabel>
                  <Input type="date" {...field} value={field.value ?? ""} />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* 설명/비고 */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>설명/비고 (선택)</FormLabel>
                <Textarea
                  placeholder="설명 또는 비고 사항을 입력하세요"
                  className="resize-none h-20"
                  {...field}
                  value={field.value ?? ""}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </Form>
    </FormSheet>
  )
}
