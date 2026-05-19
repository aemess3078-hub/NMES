import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { MES_NAV } from '@/lib/nav-config';
import { FeatureProvider } from '@/lib/contexts/feature-context';
import { getEnabledFeatureCodes, getEnabledMenuCodes } from '@/lib/services/feature.service';
import { AIChatButton } from '@/components/common/ai-chat';

export const dynamic = 'force-dynamic';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

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

  const filteredNav = MES_NAV.map((section) => ({
    ...section,
    children: (section.children ?? []).filter((item) => {
      if (!item.href) return true;
      const menuCode = item.href.split('/').pop() ?? '';
      return enabledMenuCodes.includes(menuCode);
    }),
  })).filter((section) => (section.children ?? []).length > 0);

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
      <AIChatButton />
    </FeatureProvider>
  );
}
