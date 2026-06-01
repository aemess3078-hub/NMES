/**
 * 개발자 전용 계정 판별 유틸리티
 *
 * 현재는 loginId='admin' 계정을 개발자로 취급한다.
 * 향후 UserRole.DEVELOPER를 schema에 추가하는 시점에 이 파일을 제거한다.
 *
 * NOTE: 'use server' 없는 순수 모듈 — Server Component, Client Component,
 *       Server Action 어디서든 import 가능.
 */

export const DEVELOPER_LOGIN_ID = 'admin' as const

/**
 * 이미 로드된 user 객체만으로 개발자 여부를 판별하는 순수 함수.
 * DB 호출 없음.
 */
export function isDeveloperUser(
  user: { loginId: string } | null | undefined,
): boolean {
  return user?.loginId === DEVELOPER_LOGIN_ID
}
