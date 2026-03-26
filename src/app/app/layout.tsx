import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getMenuTree } from '@/lib/actions/menu.actions';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  const menuTree = await getMenuTree();

  const userName = session.user.user_metadata?.name || session.user.email?.split('@')[0];
  const userEmail = session.user.email;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        menuTree={menuTree}
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
  );
}
