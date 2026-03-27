"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ko } from "date-fns/locale"

type Props = {
  workerName?: string
  onLogout?: () => void
}

export function PopHeader({ workerName = "작업자", onLogout }: Props) {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <header className="bg-slate-800 text-white px-6 py-3 flex items-center justify-between">
      <div className="font-bold text-lg">Cloud MES</div>
      <div className="text-center">
        <div className="text-xl font-mono tabular-nums">
          {format(now, "HH:mm:ss")}
        </div>
        <div className="text-sm text-slate-300">
          {format(now, "yyyy년 MM월 dd일 (EEE)", { locale: ko })}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-slate-300">{workerName}</span>
        <Link
          href="/app/mes/"
          className="text-sm bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded-lg transition-colors"
        >
          시스템모드
        </Link>
        <button
          onClick={onLogout}
          className="text-sm bg-red-600 hover:bg-red-700 px-3 py-1 rounded-lg transition-colors"
        >
          로그아웃
        </button>
      </div>
    </header>
  )
}
