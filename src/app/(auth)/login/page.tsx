"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Loader2, Monitor, Factory } from "lucide-react"
import { popLogin } from "@/lib/actions/pop.actions"
import { PopNumberPad } from "@/app/pop/components/pop-number-pad"

// ─── Types ────────────────────────────────────────────────────────────────────

type LoginMode = "select" | "system" | "worker"

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [mode, setMode] = useState<LoginMode>("select")

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* 상단 로고 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-800 text-white text-xl font-bold mb-4">
            M
          </div>
          <h1 className="text-3xl font-bold text-slate-800">Cloud MES</h1>
          <p className="text-slate-500 mt-2">스마트 제조 실행 시스템</p>
        </div>

        {/* 모드에 따라 조건부 렌더링 */}
        {mode === "select" && (
          <ModeSelectCards onSelect={setMode} />
        )}
        {mode === "system" && (
          <SystemLoginForm onBack={() => setMode("select")} />
        )}
        {mode === "worker" && (
          <WorkerLoginForm onBack={() => setMode("select")} />
        )}
      </div>
    </div>
  )
}

// ─── 모드 선택 카드 ───────────────────────────────────────────────────────────

function ModeSelectCards({
  onSelect,
}: {
  onSelect: (mode: LoginMode) => void
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* 시스템모드 카드 */}
      <button
        onClick={() => onSelect("system")}
        className="p-8 bg-white rounded-2xl border-2 border-slate-200 hover:border-blue-400 hover:shadow-lg transition-all text-left group"
      >
        <Monitor className="h-12 w-12 text-blue-500 mb-4 group-hover:scale-110 transition-transform" />
        <h2 className="text-xl font-bold text-slate-800">시스템모드</h2>
        <p className="text-slate-500 mt-1">관리자·생산관리자용</p>
        <p className="text-sm text-slate-400 mt-2">PC 환경에 최적화된 관리 화면</p>
      </button>

      {/* 작업자모드 카드 */}
      <button
        onClick={() => onSelect("worker")}
        className="p-8 bg-white rounded-2xl border-2 border-slate-200 hover:border-emerald-400 hover:shadow-lg transition-all text-left group"
      >
        <Factory className="h-12 w-12 text-emerald-500 mb-4 group-hover:scale-110 transition-transform" />
        <h2 className="text-xl font-bold text-slate-800">작업자모드</h2>
        <p className="text-slate-500 mt-1">현장 작업자용</p>
        <p className="text-sm text-slate-400 mt-2">태블릿·키오스크 터치 최적화</p>
      </button>
    </div>
  )
}

// ─── 시스템 로그인 폼 (이메일/비밀번호) ──────────────────────────────────────

function SystemLoginForm({ onBack }: { onBack: () => void }) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [signupMode, setSignupMode] = useState(false)

  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      if (!signupMode) {
        // 로컬 개발 우회: test@test.com / 123456
        if (email === "test@test.com" && password === "123456") {
          document.cookie = "nmes-dev-bypass=true; path=/"
          document.cookie = "nmes-mode=system; path=/"
          window.location.href = "/app/mes/"
          return
        }

        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (authError) throw authError
        document.cookie = "nmes-mode=system; path=/"
        window.location.href = "/app/mes/"
      } else {
        const { error: authError } = await supabase.auth.signUp({
          email,
          password,
        })
        if (authError) throw authError
        setError("가입 확인 이메일을 발송했습니다. 이메일을 확인해주세요.")
        setSignupMode(false)
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(
          err.message === "Invalid login credentials"
            ? "이메일 또는 비밀번호가 올바르지 않습니다."
            : err.message
        )
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8">
      <button
        onClick={onBack}
        className="text-sm text-slate-500 hover:text-slate-700 transition-colors mb-6 flex items-center gap-1"
      >
        ← 모드 선택으로
      </button>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Monitor className="h-5 w-5 text-blue-500" />
          <h2 className="text-xl font-bold text-slate-800">시스템모드 로그인</h2>
        </div>
        <p className="text-slate-500 text-sm">관리자·생산관리자 계정으로 로그인하세요</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-sm font-medium text-slate-700">
            이메일
          </Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            required
            className="h-11"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-sm font-medium text-slate-700">
            비밀번호
          </Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
            className="h-11"
          />
        </div>

        {error && (
          <p
            className={`text-sm py-1 ${
              error.includes("발송") ? "text-emerald-600" : "text-red-500"
            }`}
          >
            {error}
          </p>
        )}

        <Button
          type="submit"
          className="w-full h-11 bg-slate-800 hover:bg-slate-700 text-white"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              처리 중...
            </>
          ) : signupMode ? (
            "계정 만들기"
          ) : (
            "로그인"
          )}
        </Button>
      </form>

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => {
            setSignupMode(!signupMode)
            setError("")
          }}
          className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
        >
          {signupMode
            ? "이미 계정이 있으신가요? 로그인 →"
            : "계정이 없으신가요? 회원가입 →"}
        </button>
      </div>
    </div>
  )
}

// ─── 작업자 로그인 폼 (PIN) ───────────────────────────────────────────────────

function WorkerLoginForm({ onBack }: { onBack: () => void }) {
  const router = useRouter()
  const [pin, setPin] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handlePinComplete = async (completedPin: string) => {
    setLoading(true)
    setError("")

    try {
      // 데모용 tenantId 고정. 실제 환경에서는 테넌트 선택 단계가 필요
      const result = await popLogin(completedPin, "demo-tenant")

      if (!result) {
        setError("PIN이 올바르지 않습니다. 다시 시도해 주세요.")
        setPin("")
        setLoading(false)
        return
      }

      document.cookie = "nmes-mode=worker; path=/"
      document.cookie = `nmes-worker-name=${encodeURIComponent(result.name)}; path=/`
      window.location.href = "/pop/work-select"
    } catch {
      setError("로그인 중 오류가 발생했습니다.")
      setPin("")
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-sm mx-auto">
      <button
        onClick={onBack}
        className="text-sm text-slate-500 hover:text-slate-700 transition-colors mb-6 flex items-center gap-1"
      >
        ← 모드 선택으로
      </button>

      <div className="mb-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Factory className="h-5 w-5 text-emerald-500" />
          <h2 className="text-xl font-bold text-slate-800">작업자 PIN 로그인</h2>
        </div>
        <p className="text-slate-500 text-sm">4자리 PIN을 입력하세요</p>
        <p className="text-slate-400 text-xs mt-1">데모 PIN: 0000</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : (
        <PopNumberPad
          value={pin}
          onChange={setPin}
          onComplete={handlePinComplete}
          maxLength={4}
        />
      )}

      {error && (
        <p className="text-sm text-red-500 text-center mt-4">{error}</p>
      )}
    </div>
  )
}
