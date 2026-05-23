"use client"

import { useState, useTransition } from "react"
import { useRouter, usePathname } from "next/navigation"
import {
  Truck,
  PackagePlus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  Info,
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DataTable } from "@/components/common/data-table"
import { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import type {
  OutsourcingData,
  OutsourcingOrderRow,
  OutsourcingReceivingRow,
} from "@/lib/actions/outsourcing.actions"
import { PurchaseOrderStatus } from "@prisma/client"

// ─── Status labels ────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  DRAFT: "초안",
  ORDERED: "발주완료",
  PARTIAL_RECEIVED: "부분입고",
  RECEIVED: "입고완료",
  CLOSED: "마감",
  CANCELLED: "취소",
}

const STATUS_STYLE: Record<PurchaseOrderStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600 border-0",
  ORDERED: "bg-blue-100 text-blue-700 border-0",
  PARTIAL_RECEIVED: "bg-amber-100 text-amber-700 border-0",
  RECEIVED: "bg-emerald-100 text-emerald-700 border-0",
  CLOSED: "bg-slate-100 text-slate-500 border-0",
  CANCELLED: "bg-red-100 text-red-500 border-0",
}

const RESULT_STYLE: Record<string, string> = {
  PASS: "bg-emerald-100 text-emerald-700 border-0",
  FAIL: "bg-red-100 text-red-700 border-0",
  CONDITIONAL: "bg-amber-100 text-amber-700 border-0",
}

const RESULT_LABEL: Record<string, string> = {
  PASS: "합격",
  FAIL: "불합격",
  CONDITIONAL: "조건부합격",
}

// ─── Column definitions ───────────────────────────────────────────────────────

const orderColumns: ColumnDef<OutsourcingOrderRow>[] = [
  {
    accessorKey: "orderNo",
    header: "발주번호",
    cell: ({ row }) => (
      <span className="font-mono text-[13px] font-medium">{row.original.orderNo}</span>
    ),
  },
  {
    accessorKey: "supplierName",
    header: "공급처",
    cell: ({ row }) => <span className="text-[14px]">{row.original.supplierName}</span>,
  },
  {
    accessorKey: "orderDate",
    header: "발주일",
    cell: ({ row }) => (
      <span className="text-[13px] text-muted-foreground">
        {new Date(row.original.orderDate).toLocaleDateString("ko-KR")}
      </span>
    ),
  },
  {
    accessorKey: "expectedDate",
    header: "납기일",
    cell: ({ row }) => (
      <span
        className={`text-[13px] ${
          row.original.isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"
        }`}
      >
        {new Date(row.original.expectedDate).toLocaleDateString("ko-KR")}
        {row.original.isOverdue && " ⚠"}
      </span>
    ),
  },
  {
    accessorKey: "itemCount",
    header: "품목 수",
    cell: ({ row }) => (
      <span className="text-[14px]">{row.original.itemCount}</span>
    ),
  },
  {
    accessorKey: "totalReceivedQty",
    header: "입고 현황",
    cell: ({ row }) => {
      const { totalQty, totalReceivedQty } = row.original
      const pct = totalQty > 0 ? Math.round((totalReceivedQty / totalQty) * 100) : 0
      return (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full"
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <span className="text-[13px] text-muted-foreground">
            {totalReceivedQty}/{totalQty}
          </span>
        </div>
      )
    },
  },
  {
    accessorKey: "status",
    header: "상태",
    cell: ({ row }) => {
      const s = row.original.status
      return (
        <Badge className={`text-[12px] ${STATUS_STYLE[s]}`}>
          {STATUS_LABEL[s]}
        </Badge>
      )
    },
    filterFn: (row, _id, filterValues: string[]) =>
      filterValues.includes(row.original.status),
  },
]

const receivingColumns: ColumnDef<OutsourcingReceivingRow>[] = [
  {
    accessorKey: "inspectedAt",
    header: "입고일",
    cell: ({ row }) => (
      <span className="text-[13px] font-mono text-muted-foreground">
        {new Date(row.original.inspectedAt).toLocaleDateString("ko-KR")}
      </span>
    ),
  },
  {
    accessorKey: "orderNo",
    header: "발주번호",
    cell: ({ row }) => (
      <span className="font-mono text-[13px]">{row.original.orderNo}</span>
    ),
  },
  {
    accessorKey: "supplierName",
    header: "공급처",
    cell: ({ row }) => <span className="text-[14px]">{row.original.supplierName}</span>,
  },
  {
    accessorKey: "itemName",
    header: "품목",
    cell: ({ row }) => (
      <div>
        <p className="text-[14px]">{row.original.itemName}</p>
        <p className="text-[12px] text-muted-foreground font-mono">{row.original.itemCode}</p>
      </div>
    ),
  },
  {
    accessorKey: "receivedQty",
    header: "입고 수량",
    cell: ({ row }) => <span className="text-[14px]">{row.original.receivedQty}</span>,
  },
  {
    accessorKey: "acceptedQty",
    header: "합격 수량",
    cell: ({ row }) => (
      <span className="text-[14px] text-emerald-700 font-medium">
        {row.original.acceptedQty}
      </span>
    ),
  },
  {
    accessorKey: "rejectedQty",
    header: "불합격",
    cell: ({ row }) => (
      <span
        className={`text-[14px] ${
          row.original.rejectedQty > 0 ? "text-red-600 font-medium" : "text-muted-foreground"
        }`}
      >
        {row.original.rejectedQty}
      </span>
    ),
  },
  {
    accessorKey: "result",
    header: "검사결과",
    cell: ({ row }) => {
      const r = row.original.result
      return (
        <Badge className={`text-[12px] ${RESULT_STYLE[r] ?? ""}`}>
          {RESULT_LABEL[r] ?? r}
        </Badge>
      )
    },
  },
]

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div className="py-14 text-center text-muted-foreground">
      <Truck className="mx-auto h-10 w-10 mb-3 opacity-25" />
      <p className="text-[15px]">{label} 데이터가 없습니다.</p>
      <p className="text-[13px] mt-1">기간·공급처 조건을 변경하거나 필터를 초기화해 보세요.</p>
    </div>
  )
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  icon,
  iconBg,
  label,
  value,
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: number
}) {
  return (
    <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
      <div className={`p-2 ${iconBg} rounded-lg shrink-0`}>{icon}</div>
      <div>
        <p className="text-[13px] text-muted-foreground">{label}</p>
        <p className="text-[22px] font-semibold">{value}</p>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  data: OutsourcingData
}

export function OutsourcingClient({ data }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()

  const [from, setFrom] = useState(data.filter.from ?? "")
  const [to, setTo] = useState(data.filter.to ?? "")
  const [supplierId, setSupplierId] = useState(data.filter.supplierId ?? "__all__")
  const [status, setStatus] = useState(data.filter.status ?? "__all__")

  function handleApply() {
    const params = new URLSearchParams()
    if (from) params.set("from", from)
    if (to) params.set("to", to)
    if (supplierId && supplierId !== "__all__") params.set("supplierId", supplierId)
    if (status && status !== "__all__") params.set("status", status)
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  function handleReset() {
    setFrom("")
    setTo("")
    setSupplierId("__all__")
    setStatus("__all__")
    startTransition(() => {
      router.push(pathname)
    })
  }

  const { summary, orders, receivings, partners } = data

  return (
    <>
      {/* 제약 안내 */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-[13px] text-amber-800">
          <strong>구매/외주 통합 현황 화면입니다.</strong>{" "}
          외주 전용 구분 필드가 아직 구현되지 않아 구매발주(PurchaseOrder) 전체가 조회됩니다.
          공급처 필터로 거래처를 선택하면 해당 거래처의 발주만 조회할 수 있습니다.
          발주 등록·수정 및 입고 처리는 아래 링크를 이용하세요.
        </p>
      </div>

      {/* 바로가기 */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" asChild>
          <Link href="/app/mes/purchase-orders">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            구매발주 등록/수정
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/app/mes/material-receipt">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            입고 처리
          </Link>
        </Button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <SummaryCard
          icon={<Truck className="h-5 w-5 text-blue-600" />}
          iconBg="bg-blue-50"
          label="전체 발주"
          value={summary.totalOrders}
        />
        <SummaryCard
          icon={<Clock className="h-5 w-5 text-slate-500" />}
          iconBg="bg-slate-50"
          label="발주/대기"
          value={summary.pendingOrders}
        />
        <SummaryCard
          icon={<PackagePlus className="h-5 w-5 text-amber-600" />}
          iconBg="bg-amber-50"
          label="부분입고"
          value={summary.partialReceived}
        />
        <SummaryCard
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          iconBg="bg-emerald-50"
          label="입고완료"
          value={summary.completed}
        />
        <SummaryCard
          icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
          iconBg="bg-red-50"
          label="납기지연"
          value={summary.overdue}
        />
      </div>

      {/* 필터 */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label className="text-[13px]">시작일</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="text-[14px] h-9 w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">종료일</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="text-[14px] h-9 w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">공급처</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="text-[14px] h-9 w-48">
                <SelectValue placeholder="전체 공급처" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" className="text-[14px]">
                  전체 공급처
                </SelectItem>
                {partners.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-[14px]">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px]">상태</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="text-[14px] h-9 w-40">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" className="text-[14px]">전체</SelectItem>
                {Object.entries(STATUS_LABEL).map(([v, label]) => (
                  <SelectItem key={v} value={v} className="text-[14px]">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleApply} className="h-9">
              조회
            </Button>
            <Button size="sm" variant="outline" onClick={handleReset} className="h-9">
              초기화
            </Button>
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="rounded-lg border bg-card">
        <Tabs defaultValue="orders">
          <div className="px-4 pt-4 border-b">
            <TabsList className="h-9">
              <TabsTrigger value="orders" className="text-[13px]">
                발주 현황
                <span className="ml-1.5 text-[11px] opacity-70">({orders.length})</span>
              </TabsTrigger>
              <TabsTrigger value="receivings" className="text-[13px]">
                입고 이력
                <span className="ml-1.5 text-[11px] opacity-70">({receivings.length})</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="orders" className="p-0">
            {orders.length === 0 ? (
              <EmptyState label="발주" />
            ) : (
              <DataTable
                columns={orderColumns}
                data={orders}
                filterableColumns={[
                  {
                    id: "status",
                    title: "상태",
                    options: Object.entries(STATUS_LABEL).map(([value, label]) => ({
                      value,
                      label,
                    })),
                  },
                ]}
                searchableColumns={[
                  { id: "orderNo", title: "발주번호" },
                  { id: "supplierName", title: "공급처" },
                ]}
              />
            )}
          </TabsContent>

          <TabsContent value="receivings" className="p-0">
            {receivings.length === 0 ? (
              <EmptyState label="입고 이력" />
            ) : (
              <DataTable
                columns={receivingColumns}
                data={receivings}
                searchableColumns={[
                  { id: "orderNo", title: "발주번호" },
                  { id: "itemName", title: "품목" },
                ]}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
