import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Tailwind CSS 클래스 병합 유틸리티
 * shadcn/ui 표준 패턴
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 필드 key 생성: 한글 이름을 영문 snake_case로 변환
 * "품목코드" -> "item_code" 직접 변환은 불가하므로
 * 영문 입력을 snake_case로 정규화하는 용도로 사용
 */
export function toSnakeCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * UUID v4 생성 (crypto API 사용)
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * 날짜 포맷 (한국 로케일)
 */
export function formatDate(date: Date | string, includeTime = false): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime && { hour: '2-digit', minute: '2-digit' }),
  };
  return d.toLocaleDateString('ko-KR', options);
}

/**
 * API 에러 메시지 추출
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '알 수 없는 오류가 발생했습니다.';
}

/**
 * 숫자 포맷 (천단위 콤마)
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ko-KR').format(value);
}

/**
 * 배열에서 특정 키 기준 중복 제거
 */
export function uniqueBy<T>(array: T[], key: keyof T): T[] {
  const seen = new Set();
  return array.filter((item) => {
    const k = item[key];
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * 객체 배열을 특정 키 기준으로 Map으로 변환
 */
export function indexBy<T>(array: T[], key: keyof T): Map<unknown, T> {
  return new Map(array.map((item) => [item[key], item]));
}
