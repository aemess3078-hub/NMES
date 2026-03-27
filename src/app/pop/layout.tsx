export const dynamic = "force-dynamic"

export default function PopLayout({ children }: { children: React.ReactNode }) {
  // 인증 체크는 데모 환경에서는 생략 — 직접 /pop/ 접근 가능
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col" style={{ fontSize: "18px" }}>
      {children}
    </div>
  )
}
