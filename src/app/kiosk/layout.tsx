export const metadata = {
  title: "스마트공장 현황판 — CnS Medical",
}

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white overflow-hidden">
      {children}
    </div>
  )
}
