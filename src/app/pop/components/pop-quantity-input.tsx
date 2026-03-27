"use client"

type Props = {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  className?: string
}

export function PopQuantityInput({
  label,
  value,
  onChange,
  min = 0,
  className,
}: Props) {
  const adjust = (delta: number) => {
    onChange(Math.max(min, value + delta))
  }

  const btnClass =
    "h-12 w-16 text-lg font-bold rounded-xl border-2 border-slate-300 hover:border-slate-500 hover:bg-slate-100 active:scale-95 transition-all"

  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <span className="w-24 font-semibold text-slate-700">{label}</span>
      <button className={btnClass} onClick={() => adjust(-10)}>
        −10
      </button>
      <button className={btnClass} onClick={() => adjust(-1)}>
        −1
      </button>
      <span className="w-20 text-center text-3xl font-bold tabular-nums">
        {value}
      </span>
      <button className={btnClass} onClick={() => adjust(1)}>
        +1
      </button>
      <button className={btnClass} onClick={() => adjust(10)}>
        +10
      </button>
    </div>
  )
}
