import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/db/prisma"

// ── 내부 캐시 헬퍼: 요청 간 서버 레벨 캐시 ───────────────────────────────────
// unstable_cache는 Next.js 서버 수준에서 결과를 유지합니다.
// - tenantId가 캐시 키에 포함되어 테넌트 간 데이터 혼용이 없습니다.
// - revalidate: 60 → 60초 TTL (데모 환경에서 권한은 변경이 없음)
// - 페이지 이동 시마다 반복되던 TenantFeature DB 쿼리를 제거합니다.
const _getEnabledTenantFeatures = unstable_cache(
  async (tenantId: string) => {
    return prisma.tenantFeature.findMany({
      where: { tenantId, isEnabled: true },
      include: { feature: true },
    })
  },
  ["enabled-tenant-features"],
  { revalidate: 60 }
)

// 1. 테넌트 활성 기능 코드 목록
export async function getEnabledFeatureCodes(tenantId: string): Promise<string[]> {
  const tenantFeatures = await _getEnabledTenantFeatures(tenantId)
  return tenantFeatures.map((tf) => tf.feature.code)
}

// 2. 전체 기능 카탈로그 (의존성 포함)
export async function getFeatureCatalog() {
  return prisma.featureDefinition.findMany({
    include: {
      dependencies: { include: { dependsOn: true } },
      dependedBy: { include: { feature: true } },
    },
    orderBy: { displayOrder: "asc" },
  })
}

// 3. 기능 활성화 (필수 의존성 자동 포함)
export async function enableFeature(
  tenantId: string,
  featureCode: string
): Promise<{ enabled: string[]; optional: string[] }> {
  const allFeatures = await prisma.featureDefinition.findMany({
    include: { dependencies: { include: { dependsOn: true } } },
  })
  const featureMap = Object.fromEntries(allFeatures.map((f) => [f.code, f]))

  // 재귀적으로 필수 의존성 수집
  const toEnable = new Set<string>()
  const optional: string[] = []

  function collectDeps(code: string) {
    if (toEnable.has(code)) return
    toEnable.add(code)
    const feat = featureMap[code]
    if (!feat) return
    for (const dep of feat.dependencies) {
      if (dep.isRequired) {
        collectDeps(dep.dependsOn.code)
      } else {
        if (!optional.includes(dep.dependsOn.code)) optional.push(dep.dependsOn.code)
      }
    }
  }

  collectDeps(featureCode)

  const toEnableArray = Array.from(toEnable) as string[]

  // TenantFeature upsert
  for (const code of toEnableArray) {
    const feat = featureMap[code]
    if (!feat) continue
    await prisma.tenantFeature.upsert({
      where: { tenantId_featureId: { tenantId, featureId: feat.id } },
      update: { isEnabled: true },
      create: { tenantId, featureId: feat.id, isEnabled: true },
    })
  }

  return { enabled: toEnableArray, optional }
}

// 4. 기능 비활성화 (역의존성 검사)
export async function disableFeature(
  tenantId: string,
  featureCode: string
): Promise<{ success: boolean; blockedBy?: string[] }> {
  const feature = await prisma.featureDefinition.findUnique({
    where: { code: featureCode },
    include: { dependedBy: { include: { feature: true } } },
  })

  if (!feature) return { success: false }
  if (feature.isCore) return { success: false, blockedBy: ["core"] }

  // 이 기능을 필수로 사용하는 활성화된 기능 확인
  const enabledCodes = await getEnabledFeatureCodes(tenantId)
  const blockedBy = feature.dependedBy
    .filter((dep) => dep.isRequired && enabledCodes.includes(dep.feature.code))
    .map((dep) => dep.feature.name)

  if (blockedBy.length > 0) return { success: false, blockedBy }

  await prisma.tenantFeature.updateMany({
    where: { tenantId, feature: { code: featureCode } },
    data: { isEnabled: false },
  })

  return { success: true }
}

// 5. 단건 체크
export async function isFeatureEnabled(tenantId: string, featureCode: string): Promise<boolean> {
  const tf = await prisma.tenantFeature.findFirst({
    where: { tenantId, isEnabled: true, feature: { code: featureCode } },
  })
  return !!tf
}

// 6. 활성 기능의 menuCodes만 필터링
export async function getEnabledMenuCodes(tenantId: string): Promise<string[]> {
  const tenantFeatures = await _getEnabledTenantFeatures(tenantId)
  return tenantFeatures.flatMap((tf) => tf.feature.menuCodes)
}
