import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { MES_NAV } from '@/lib/nav-config';
import { FeatureProvider } from '@/lib/contexts/feature-context';
import { getEnabledFeatureCodes, getEnabledMenuCodes } from '@/lib/services/feature.service';
import type { NavItem } from '@/types/menu';

export const dynamic = 'force-dynamic';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ── [PERF-TEMP] 성능 계측 임시 코드 — 측정 완료 후 제거 ──────────────────
  const _t0 = Date.now()
  // ─────────────────────────────────────────────────────────────────────────

  const user = await getCurrentUser();

  // ── [PERF-TEMP] ──────────────────────────────────────────────────────────
  const _tAuth = Date.now()
  console.log(`[PERF] layout.getCurrentUser ${_tAuth - _t0}ms`)
  // ─────────────────────────────────────────────────────────────────────────

  if (!user) {
    redirect('/login');
  }

  if (user.mustChangePw) {
    redirect('/auth/change-password');
  }

  const [enabledFeatures, enabledMenuCodes] = await Promise.all([
    getEnabledFeatureCodes(user.tenantId),
    getEnabledMenuCodes(user.tenantId),
  ]);

  // ── [PERF-TEMP] ──────────────────────────────────────────────────────────
  const _tFeatures = Date.now()
  console.log(`[PERF] layout.features+menu ${_tFeatures - _tAuth}ms`)
  console.log(`[PERF] layout.total ${_tFeatures - _t0}ms`)
  // ─────────────────────────────────────────────────────────────────────────

  function filterNav(items: NavItem[], codes: string[]): NavItem[] {
    return items.reduce<NavItem[]>((acc, item) => {
      if (item.children.length > 0) {
        const filtered = filterNav(item.children, codes)
        if (filtered.length > 0) acc.push({ ...item, children: filtered })
      } else if (item.comingSoon || !item.href) {
        acc.push(item)
      } else {
        const menuCode = item.href.split('/').pop() ?? ''
        if (codes.includes(menuCode)) acc.push(item)
      }
      return acc
    }, [])
  }
  const filteredNav = filterNav(MES_NAV, enabledMenuCodes)

  return (
    <FeatureProvider enabledFeatures={enabledFeatures}>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar
          navItems={filteredNav}
          userName={user.name}
          userEmail={user.email}
        />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Header title="Cloud MES" />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </FeatureProvider>
  );
}
