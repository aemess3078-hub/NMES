// 재공품재고 로딩 스켈레톤 — 서버 데이터 로딩 중 표시
export default function WipInventoryLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="space-y-1.5">
        <div className="h-7 w-44 rounded-md bg-muted" />
        <div className="h-5 w-80 rounded-md bg-muted" />
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card px-4 py-3 space-y-2">
            <div className="h-4 w-16 rounded bg-muted" />
            <div className="h-7 w-20 rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* 테이블 */}
      <div className="space-y-3">
        <div className="flex gap-3">
          <div className="h-9 w-80 rounded-md bg-muted" />
          <div className="h-9 w-36 rounded-md bg-muted" />
          <div className="h-9 w-36 rounded-md bg-muted" />
        </div>
        <div className="rounded-md border">
          <div className="h-10 border-b bg-muted/40 rounded-t-md" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 border-b last:border-b-0 bg-background" />
          ))}
        </div>
      </div>
    </div>
  )
}
