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
}
