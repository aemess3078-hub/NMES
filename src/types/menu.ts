/**
 * 메뉴 타입 정의
 */

// Static navigation item — used for hardcoded MES nav (no DB dependency)
export interface NavItem {
  id: string;
  parentId: string | null;
  label: string;
  icon: string;
  href?: string;       // direct route for static pages
  children: NavItem[];
  displayOrder: number;
  comingSoon?: boolean; // true → 준비중 배지 표시, 클릭 비활성화
}
