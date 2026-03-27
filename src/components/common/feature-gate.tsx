"use client"

import { useFeature } from "@/lib/contexts/feature-context"

type Props = {
  featureCode: string
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function FeatureGate({ featureCode, children, fallback = null }: Props) {
  const enabled = useFeature(featureCode)
  return enabled ? <>{children}</> : <>{fallback}</>
}
