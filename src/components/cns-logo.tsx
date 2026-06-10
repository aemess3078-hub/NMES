import Image from "next/image"

interface CnsLogoProps {
  size?: "sm" | "lg"
  className?: string
}

/**
 * 브랜드 로고 컴포넌트.
 * NEXT_PUBLIC_BRAND=newmes 환경변수가 설정된 경우 "NewMES" 텍스트 로고를 표시.
 * 미설정(기본값)이면 CNS Medical 이미지 로고를 표시.
 * size="sm" → 사이드바 / POP 헤더
 * size="lg" → 로그인 / 메인 화면
 */
export function CnsLogo({ size = "sm", className }: CnsLogoProps) {
  const isNewMes = process.env.NEXT_PUBLIC_BRAND === "newmes"

  if (isNewMes) {
    const textSize = size === "lg" ? "text-[38px]" : "text-[20px]"
    return (
      <div className={`flex items-baseline leading-none select-none ${textSize} ${className ?? ""}`}>
        <span className="font-light tracking-tight">New</span>
        <span className="font-bold tracking-tight">MES</span>
      </div>
    )
  }

  const h = size === "lg" ? 78 : 56
  return (
    <Image
      src="/logo-cns-medical.png"
      alt="CNS Medical"
      width={0}
      height={0}
      sizes="400px"
      style={{ height: `${h}px`, width: "auto" }}
      priority
      className={className}
    />
  )
}
