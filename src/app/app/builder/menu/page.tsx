import { getAllMenuItems } from '@/lib/actions/menu.actions';
import { getSchemas } from '@/lib/actions/schema.actions';
import { buildMenuTree } from '@/types/menu';
import { MenuBuilderClient } from '@/components/menu-builder/menu-builder-client';

export default async function MenuBuilderPage() {
  const [menuItems, schemas] = await Promise.all([
    getAllMenuItems(),
    getSchemas(),
  ]);

  const menuTree = buildMenuTree(menuItems);

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-[28px] font-semibold leading-[1.2] tracking-tight text-foreground mb-1">
          메뉴 빌더
        </h1>
        <p className="text-[15px] leading-[1.5] text-muted-foreground">
          사이드바 메뉴 구조를 설계합니다. 드래그로 순서를 바꾸세요.
        </p>
      </div>
      <MenuBuilderClient
        initialTree={menuTree}
        schemas={schemas.map((s) => ({ id: s.id, name: s.name }))}
      />
    </div>
  );
}
