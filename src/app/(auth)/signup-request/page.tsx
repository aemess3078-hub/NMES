"use client"

import { useState } from "react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, CheckCircle } from "lucide-react"
import { createSignupRequest } from "@/lib/actions/signup-request.actions"
import { UserRole } from "@prisma/client"

const ROLE_OPTIONS: { label: string; value: UserRole }[] = [
  { label: "매니저", value: "MANAGER" },
  { label: "작업자", value: "OPERATOR" },
  { label: "조회자", value: "VIEWER" },
]

export default function SignupRequestPage() {
  const [form, setForm] = useState({
    email: "",
    name: "",
    department: "",
    phone: "",
    requestedRole: "OPERATOR" as UserRole,
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  // 실제 환경에서는 테넌트 선택 단계가 필요합니다.
  // 현재는 쿠키 또는 기본값 사용
  const tenantId =
    typeof document !== "undefined"
      ? document.cookie
          .split("; ")
          .find((c) => c.startsWith("tenantId="))
          ?.split("=")[1] ?? "tenant-demo-001"
      : "tenant-demo-001"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await createSignupRequest({
        tenantId,
        email: form.email,
        name: form.name,
        department: form.department || undefined,
        phone: form.phone || undefined,
        requestedRole: form.requestedRole,
      })
      setResult(res)
    } catch {
      setResult({ success: false, message: "서버 오류가 발생했습니다." })
    } finally {
      setLoading(false)
    }
  }

  if (result?.success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-4">
          <CheckCircle className="h-14 w-14 text-emerald-500 mx-auto" />
          <h2 className="text-2xl font-bold text-slate-800">신청 완료</h2>
          <p className="text-slate-600 text-[15px]">{result.message}</p>
          <Link href="/login">
            <Button variant="outline" className="mt-2 w-full">로그인 페이지로</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 로고 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-800 text-white text-xl font-bold mb-4">
            M
          </div>
          <h1 className="text-2xl font-bold text-slate-800">가입 신청</h1>
          <p className="text-slate-500 mt-1 text-[14px]">관리자 승인 후 계정이 생성됩니다</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[14px] font-medium text-slate-700">
                이메일 <span className="text-red-500">*</span>
              </Label>
              <Input
                type="email"
                required
                placeholder="name@company.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[14px] font-medium text-slate-700">
                이름 <span className="text-red-500">*</span>
              </Label>
              <Input
                required
                placeholder="홍길동"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[14px] font-medium text-slate-700">부서</Label>
              <Input
                placeholder="예: 생산팀"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[14px] font-medium text-slate-700">연락처</Label>
              <Input
                type="tel"
                placeholder="010-0000-0000"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[14px] font-medium text-slate-700">
                요청 역할 <span className="text-red-500">*</span>
              </Label>
              <Select
                value={form.requestedRole}
                onValueChange={(v) => setForm({ ...form, requestedRole: v as UserRole })}
              >
                <SelectTrigger className="h-10 text-[14px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-[14px]">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {result && !result.success && (
              <p className="text-[13px] text-red-500 bg-red-50 rounded-lg px-3 py-2">
                {result.message}
              </p>
            )}

            <Button
              type="submit"
              className="w-full h-10 bg-slate-800 hover:bg-slate-700 text-white mt-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  처리 중...
                </>
              ) : (
                "가입 신청"
              )}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Link
              href="/login"
              className="text-[13px] text-slate-400 hover:text-slate-600 transition-colors"
            >
              이미 계정이 있으신가요? 로그인 →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
