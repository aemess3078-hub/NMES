/**
 * Prisma 클라이언트 싱글턴
 * Next.js 개발 환경에서 HMR로 인한 다중 인스턴스 생성을 방지합니다.
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function buildDatabaseUrl() {
  const url = process.env.DATABASE_URL ?? '';
  if (!url || url.includes('connection_limit')) return url;
  // Supabase 세션 모드 풀(pool_size 기본 15) 고갈 방지:
  // dev 1개 인스턴스당 최대 2 커넥션만 사용
  const separator = url.includes('?') ? '&' : '?';
  return url + separator + 'connection_limit=2&pool_timeout=10&connect_timeout=10';
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: buildDatabaseUrl() } },
    log:
      process.env.NODE_ENV === 'development'
        ? ['error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
