---
name: Cloud MES 프로젝트 개요
description: Cloud MES 프로젝트의 기술 스택, 아키텍처, 주요 파일 구조 정보
type: project
---

Next.js 14 App Router + TypeScript + Tailwind CSS + shadcn/ui + Zustand + Prisma + Supabase Auth 스택으로 구성된 커스터마이징 MES 프로젝트.

주요 경로:
- 루트 레이아웃: src/app/layout.tsx (globals.css import 포함)
- 인증 페이지: src/app/(auth)/login/page.tsx (별도 layout.tsx 없음)
- 앱 레이아웃: src/app/app/layout.tsx (서버 컴포넌트, Supabase 세션 체크 후 redirect)
- 사이드바: src/components/layout/sidebar.tsx (클라이언트 컴포넌트)
- 헤더: src/components/layout/header.tsx (클라이언트 컴포넌트)
- 전역 상태: src/stores/app.store.ts (Zustand + persist 미들웨어)

**Why:** 초기 검토 시점(2026-03-25) UI/UX 이슈 보고로 검토 착수.

**How to apply:** 향후 코드 검토 시 아래 반복 패턴을 우선 확인.
