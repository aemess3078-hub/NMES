import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { isDeveloperUser } from '@/lib/developer';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { MES_NAV } from '@/lib/nav-config';
import { FeatureProvider } from '@/lib/contexts/feature-context'
import { UserRoleProvider } from '@/lib/contexts/user-role-context';
import { getEnabledFeatureCodes, getEnabledMenuCodes } from '@/lib/services/feature.service';
import { cookies } from 'next/headers';
import { IdleLogoutProvider } from './idle-logout-provider';
import { NMES_SESSION_COOKIE } from '@/lib/jwt';
import type { NavItem } from '@/types/menu';
import type { UserRole } from '@prisma/client';

export const dynamic = 'force-dynamic';

const ROLE_HIERARCHY: Record<UserRole, number> = {
  OWNER: 5, ADMIN: 4, MANAGER: 3, OPERATOR: 2, VIEWER: 1,
};

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
    const store = await cookies();
    if (store.get(NMES_SESSION_COOKIE)?.value) {
      redirect('/api/auth/clear-session?next=/login&reason=session-expired');
    }
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

  const userRole = user.role
  const isDev = isDeveloperUser(user)
  function filterNav(items: NavItem[], codes: string[]): NavItem[] {
    return items.reduce<NavItem[]>((acc, item) => {
      // 개발자 전용 메뉴: loginId='test' 계정에만 표시
      if (item.developerOnly && !isDev) return acc
      if (item.minRole && ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[item.minRole]) {
        return acc
      }
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
      <UserRoleProvider role={userRole}>
        <IdleLogoutProvider />
        <div className="flex h-screen overflow-hidden bg-background">
          <Sidebar
            navItems={filteredNav}
            userName={user.name}
            userEmail={user.email}
          />
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </div>
      </UserRoleProvider>
    </FeatureProvider>
  );
}
