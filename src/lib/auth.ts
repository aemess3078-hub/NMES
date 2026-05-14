'use server';

import { UserRole } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';

export type AuthContext = {
  userId: string;
  email: string;
  name: string | null;
};

export type TenantContext = AuthContext & {
  tenantId: string;
  siteId: string | null;
  role: UserRole;
};

async function ensureProfile(user: {
  id: string;
  email?: string | null;
  user_metadata?: { name?: string | null };
}) {
  const db = createAdminClient();

  await db.from('profiles').upsert(
    {
      id: user.id,
      email: user.email ?? '',
      name: user.user_metadata?.name ?? user.email?.split('@')[0] ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id', ignoreDuplicates: true }
  );
}

export async function requireAuth(): Promise<AuthContext> {
  const supabase = createServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.id) {
    throw new Error('Authentication required');
  }

  await ensureProfile(session.user);

  return {
    userId: session.user.id,
    email: session.user.email ?? '',
    name: session.user.user_metadata?.name ?? session.user.email?.split('@')[0] ?? null,
  };
}

export async function getCurrentUserId(): Promise<string> {
  const auth = await requireAuth();
  return auth.userId;
}

export async function requireTenantContext(): Promise<TenantContext> {
  const auth = await requireAuth();

  const tenantUser = await prisma.tenantUser.findFirst({
    where: {
      profileId: auth.userId,
      isActive: true,
    },
    orderBy: { createdAt: 'asc' },
    select: {
      tenantId: true,
      siteId: true,
      role: true,
    },
  });

  if (!tenantUser) {
    throw new Error('Tenant context not found');
  }

  return {
    ...auth,
    tenantId: tenantUser.tenantId,
    siteId: tenantUser.siteId,
    role: tenantUser.role,
  };
}

export async function assertTenantResource<T>(
  loadResource: (tenantContext: TenantContext) => Promise<T | null>,
  message = 'Resource not found in tenant scope'
): Promise<T> {
  const tenantContext = await requireTenantContext();
  const resource = await loadResource(tenantContext);

  if (!resource) {
    throw new Error(message);
  }

  return resource;
}
