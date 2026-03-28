import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { MES_NAV } from '@/lib/nav-config';
import { FeatureProvider } from '@/lib/contexts/feature-context';
import { getEnabledFeatureCodes, getEnabledMenuCodes } from '@/lib/services/feature.service';
import { cookies } from 'next/headers';
import { AIChatButton } from '@/components/common/ai-chat';

export const dynamic = 'force-dynamic';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const isDevBypass = cookieStore.get('nmes-dev-bypass')?.value === 'true';

  let userName = '개발자';
  let userEmail = 'dev@localhost';

  if (!isDevBypass) {
    const supabase = createServerClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      redirect('/login');
    }

    userName = session.user.user_metadata?.name || session.user.email?.split('@')[0] || '사용자';
    userEmail = session.user.email ?? '';
  }

  const tenantId = cookieStore.get('tenantId')?.value ?? 'tenant-demo-001';

  // 활성 기능 코드 목록 + 활성 menuCode 목록 병렬 조회
  const [enabledFeatures, enabledMenuCodes] = await Promise.all([
    getEnabledFeatureCodes(tenantId),
    getEnabledMenuCodes(tenantId),
  ]);

  // MES_NAV 필터링: 각 섹션의 children 중 enabledMenuCodes에 포함된 것만 표시
  // href의 마지막 세그먼트를 menuCode로 사용
  const filteredNav = MES_NAV.map((section) => ({
    ...section,
    children: (section.children ?? []).filter((item) => {
      if (!item.href) return true; // 폴더 노드는 항상 표시
      const menuCode = item.href.split('/').pop() ?? '';
      return enabledMenuCodes.includes(menuCode);
    }),
  })).filter((section) => (section.children ?? []).length > 0);

  return (
    <FeatureProvider enabledFeatures={enabledFeatures}>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar
          navItems={filteredNav}
          userName={userName}
          userEmail={userEmail}
        />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Header title="Cloud MES" />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
      <AIChatButton />
    </FeatureProvider>
  );
}
