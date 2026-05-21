import Image from "next/image"

interface CnsLogoProps {
  size?: "sm" | "lg"
  className?: string
}

/**
 * CNS Medical 브랜드 로고 컴포넌트.
 * size="sm" → 사이드바 / POP 헤더 (28px 높이)
 * size="lg" → 로그인 / 메인 화면 (52px 높이)
 * width는 이미지 원본 비율에 따라 자동 결정됨.
 */
export function CnsLogo({ size = "sm", className }: CnsLogoProps) {
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
