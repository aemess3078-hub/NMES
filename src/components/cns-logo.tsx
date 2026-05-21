interface CnsLogoProps {
  size?: "sm" | "lg"
  className?: string
}

/**
 * CNS Medical 브랜드 로고 컴포넌트.
 * size="sm"  → 사이드바 / POP 헤더 (14px 기준)
 * size="lg"  → 로그인 / 메인 화면 (52px 기준)
 * 텍스트 색상은 부모에서 className으로 제어, 보라색 강조만 고정.
 */
export function CnsLogo({ size = "sm", className }: CnsLogoProps) {
  if (size === "lg") {
    return (
      <div
        className={`flex items-end gap-3 select-none${className ? " " + className : ""}`}
        aria-label="CNS Medical"
      >
        {/* cns — 굵은 서체 + 보라색 모서리 강조 */}
        <div className="relative leading-none">
          {/* 'c' 위 왼쪽 */}
          <span className="absolute top-0 left-0 w-[15px] h-[15px] bg-violet-600 rounded-[2px]" aria-hidden="true" />
          {/* 's' 위 오른쪽 */}
          <span className="absolute top-0 right-0 w-[15px] h-[15px] bg-violet-600 rounded-[2px]" aria-hidden="true" />
          <span
            className="text-[52px] font-black leading-none"
            style={{ letterSpacing: "-1.5px" }}
          >
            cns
          </span>
        </div>

        {/* Medical + */}
        <div className="relative leading-none pb-[4px]">
          <span
            className="absolute -top-[6px] -right-[14px] text-violet-600 font-black text-[18px] leading-none"
            aria-hidden="true"
          >
            +
          </span>
          <span className="text-[34px] font-semibold leading-none">
            Medical
          </span>
        </div>
      </div>
    )
  }

  /* sm — 사이드바 / POP 헤더 */
  return (
    <div
      className={`flex items-end gap-1 select-none${className ? " " + className : ""}`}
      aria-label="CNS Medical"
    >
      <div className="relative leading-none">
        <span className="absolute top-0 left-0 w-[5px] h-[5px] bg-violet-600 rounded-[1px]" aria-hidden="true" />
        <span className="absolute top-0 right-0 w-[5px] h-[5px] bg-violet-600 rounded-[1px]" aria-hidden="true" />
        <span
          className="text-[14px] font-black leading-none"
          style={{ letterSpacing: "-0.5px" }}
        >
          cns
        </span>
      </div>
      <div className="relative leading-none">
        <span
          className="absolute -top-[3px] -right-[7px] text-violet-600 font-black text-[8px] leading-none"
          aria-hidden="true"
        >
          +
        </span>
        <span className="text-[12px] font-semibold leading-none opacity-80">
          Medical
        </span>
      </div>
    </div>
  )
}
