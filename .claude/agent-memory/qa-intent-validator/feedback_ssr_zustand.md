---
name: Zustand persist SSR Hydration 이슈
description: Zustand persist 미들웨어와 Next.js SSR 충돌 패턴 - 사이드바 초기 상태 불일치
type: feedback
---

Zustand `persist` 미들웨어는 localStorage에서 상태를 복원하는데, 서버 렌더링 시점에는 localStorage가 존재하지 않아 SSR HTML과 클라이언트 Hydration 결과가 달라질 수 있다.

이 프로젝트에서 `isSidebarOpen: true` 가 SSR 기본값인데, 사용자가 sidebar를 닫은 상태(`false`)를 localStorage에 저장했다면 초기 렌더링에서 사이드바가 `w-64`로 보였다가 Hydration 후 `w-0`으로 갑자기 변하는 레이아웃 점프 현상이 발생한다.

**Why:** 사용자 보고 "UI 위치가 중구난방" 원인 중 하나로 식별됨.

**How to apply:** Zustand persist를 사용하는 컴포넌트 검토 시, `useEffect`/`useState`로 hydration 완료 후에만 persist 값을 읽도록 처리했는지 확인할 것. `skipHydration` 옵션 또는 `_hasHydrated` 가드 패턴 적용 여부를 체크.
