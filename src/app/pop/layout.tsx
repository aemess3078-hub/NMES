export const dynamic = "force-dynamic"

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

export default async function PopLayout({ children }: { children: React.ReactNode }) {
  // 세션이 없으면 기존 POP PIN/데모 흐름 유지 (무인증 접근 허용)
  // 세션이 있고 mustChangePw=true이면 강제 비밀번호 변경으로 이동
  const user = await getCurrentUser()
  if (user?.mustChangePw) {
    redirect('/auth/change-password')
  }

  return (
    <div className="h-screen overflow-y-auto bg-slate-100" style={{ fontSize: "18px" }}>
      {children}
    </div>
  )
}
