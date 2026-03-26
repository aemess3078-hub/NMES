/**
 * 메뉴 트리 타입 정의
 */

export type MenuType = 'FOLDER' | 'SCHEMA' | 'SCREEN' | 'FLOW' | 'DIVIDER';

export interface MenuItem {
  id: string;
  parentId: string | null;
  name: string;
  icon: string | null;
  menuType: MenuType;
  schemaId: string | null;
  screenId: string | null;
  flowId: string | null;
  displayOrder: number;
  isVisible: boolean;
  children?: MenuItem[];
}

export interface MenuTree extends MenuItem {
  children: MenuTree[];
}

// 메뉴 클릭 시 이동할 경로 계산
export function resolveMenuPath(menu: MenuItem): string {
  switch (menu.menuType) {
    case 'SCHEMA':
      return menu.schemaId ? `/app/data/${menu.schemaId}` : '#';
    case 'SCREEN':
      return menu.screenId ? `/app/screens/${menu.screenId}` : '#';
    case 'FLOW':
      return menu.flowId ? `/app/flows/${menu.flowId}` : '#';
    case 'FOLDER':
    case 'DIVIDER':
    default:
      return '#';
  }
}

// 평탄한 메뉴 배열을 트리 구조로 변환
export function buildMenuTree(items: MenuItem[]): MenuTree[] {
  const itemMap = new Map<string, MenuTree>();
  const roots: MenuTree[] = [];

  // 모든 아이템을 맵에 등록
  for (const item of items) {
    itemMap.set(item.id, { ...item, children: [] });
  }

  // 부모-자식 관계 설정
  for (const item of items) {
    const node = itemMap.get(item.id)!;
    if (item.parentId && itemMap.has(item.parentId)) {
      itemMap.get(item.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // 각 레벨에서 displayOrder 기준 정렬
  const sortChildren = (nodes: MenuTree[]): MenuTree[] => {
    return nodes
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((node) => ({ ...node, children: sortChildren(node.children) }));
  };

  return sortChildren(roots);
}
