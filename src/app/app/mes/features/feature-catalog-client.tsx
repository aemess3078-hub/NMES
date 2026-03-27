"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { enableFeatureAction, disableFeatureAction } from "@/lib/actions/feature.actions"

const CATEGORY_LABELS: Record<string, string> = {
  MASTER: "마스터 데이터",
  PRODUCTION: "생산관리",
  MATERIAL: "자재관리",
  QUALITY: "품질관리",
  EQUIPMENT: "설비관리",
  SYSTEM: "시스템",
}

type CatalogItem = {
  id: string
  code: string
  name: string
  description: string | null
  category: string
  icon: string | null
  isCore: boolean
  isEnabled: boolean
  displayOrder: number
  dependencies: { dependsOn: { code: string; name: string }; isRequired: boolean }[]
  dependedBy: { feature: { code: string; name: string }; isRequired: boolean }[]
}

type Props = { catalog: CatalogItem[]; tenantId: string }

export function FeatureCatalogClient({ catalog, tenantId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [notice, setNotice] = useState<string | null>(null)
  const [noticeType, setNoticeType] = useState<"info" | "warn">("info")

  const handleToggle = (item: CatalogItem, checked: boolean) => {
    if (item.isCore) return

    startTransition(async () => {
      if (checked) {
        const result = await enableFeatureAction(tenantId, item.code)
        if (result.enabled.length > 1) {
          setNoticeType("info")
          setNotice(`함께 활성화됨: ${result.enabled.filter((c) => c !== item.code).join(", ")}`)
          setTimeout(() => setNotice(null), 3000)
        }
      } else {
        const result = await disableFeatureAction(tenantId, item.code)
        if (!result.success && result.blockedBy) {
          setNoticeType("warn")
          setNotice(`비활성화 불가: ${result.blockedBy.join(", ")}이(가) 이 기능을 필요로 합니다`)
          setTimeout(() => setNotice(null), 4000)
          return
        }
      }
      router.refresh()
    })
  }

  const categories = Array.from(new Set(catalog.map((f) => f.category)))

  return (
    <div className="space-y-8">
      {notice && (
        <div
          className={`px-4 py-3 rounded-lg text-sm border ${
            noticeType === "warn"
              ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-blue-50 border-blue-200 text-blue-800"
          }`}
        >
          {notice}
        </div>
      )}

      {categories.map((cat) => (
        <div key={cat}>
          <h2 className="text-[18px] font-semibold text-slate-700 mb-4">
            {CATEGORY_LABELS[cat] ?? cat}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {catalog
              .filter((f) => f.category === cat)
              .map((item) => (
                <div
                  key={item.id}
                  className={`bg-white rounded-xl border-2 p-5 transition-all ${
                    item.isEnabled
                      ? "border-blue-200 shadow-sm"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[15px] font-semibold text-slate-800">
                          {item.name}
                        </span>
                        {item.isCore && (
                          <Badge variant="secondary" className="text-xs">
                            필수
                          </Badge>
                        )}
                        {item.isEnabled && !item.isCore && (
                          <Badge className="text-xs bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-100">
                            활성
                          </Badge>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-[13px] text-slate-500 mt-1">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <Switch
                      checked={item.isEnabled}
                      disabled={item.isCore || isPending}
                      onCheckedChange={(checked) => handleToggle(item, checked)}
                      className="ml-3 shrink-0"
                    />
                  </div>

                  {item.dependencies.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <div className="text-[12px] text-slate-400 mb-1.5">의존성</div>
                      <div className="flex flex-wrap gap-1">
                        {item.dependencies.map((dep) => (
                          <span
                            key={dep.dependsOn.code}
                            className={`text-[12px] px-2 py-0.5 rounded-full ${
                              dep.isRequired
                                ? "bg-red-50 text-red-600 border border-red-100"
                                : "bg-slate-50 text-slate-500 border border-slate-100"
                            }`}
                          >
                            {dep.isRequired ? "필수: " : "선택: "}
                            {dep.dependsOn.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}
