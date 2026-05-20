// 자재재고현황 로딩 스켈레톤
export default function StockLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="space-y-1.5">
        <div className="h-7 w-44 rounded-md bg-muted" />
        <div className="h-5 w-72 rounded-md bg-muted" />
      </div>

      <div className="space-y-3">
        <div className="flex gap-3">
          <div className="h-9 w-72 rounded-md bg-muted" />
          <div className="h-9 w-24 rounded-md bg-muted" />
        </div>
        <div className="rounded-md border">
          <div className="h-10 border-b bg-muted/40 rounded-t-md" />
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-12 border-b last:border-b-0 bg-background" />
          ))}
        </div>
      </div>
    </div>
  )
}
