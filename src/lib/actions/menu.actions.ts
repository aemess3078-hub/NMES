'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildMenuTree } from '@/types/menu';
import { getCurrentUserId } from '@/lib/auth';
import type { MenuItem, MenuTree } from '@/types';

export async function getMenuTree(): Promise<MenuTree[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('menus')
    .select('*')
    .eq('is_visible', true)
    .order('display_order', { ascending: true });

  if (error || !data) return [];

  const menuItems: MenuItem[] = data.map((m) => ({
    id: m.id,
    parentId: m.parent_id,
    name: m.name,
    icon: m.icon,
    menuType: m.menu_type as MenuItem['menuType'],
    schemaId: m.schema_id,
    screenId: m.screen_id,
    flowId: m.flow_id,
    displayOrder: m.display_order,
    isVisible: m.is_visible,
  }));

  return buildMenuTree(menuItems);
}

export async function createMenuItem(input: {
  parentId?: string;
  name: string;
  icon?: string;
  menuType: MenuItem['menuType'];
  schemaId?: string;
  screenId?: string;
  flowId?: string;
}): Promise<{ success: boolean; menuId?: string; error?: string }> {
  try {
    const userId = await getCurrentUserId();
    const db = createAdminClient();

    const { data, error } = await db
      .from('menus')
      .insert({
        id: crypto.randomUUID(),
        parent_id: input.parentId ?? null,
        name: input.name,
        icon: input.icon ?? null,
        menu_type: input.menuType,
        schema_id: input.schemaId ?? null,
        screen_id: input.screenId ?? null,
        flow_id: input.flowId ?? null,
        display_order: 999,
        created_by: userId,
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) throw error;
    revalidatePath('/app');
    return { success: true, menuId: data.id };
  } catch (error) {
    return { success: false, error: '메뉴 생성에 실패했습니다.' };
  }
}

export async function updateMenuOrder(
  updates: Array<{ id: string; displayOrder: number; parentId: string | null }>
): Promise<{ success: boolean; error?: string }> {
  try {
    await getCurrentUserId();
    const db = createAdminClient();

    for (const { id, displayOrder, parentId } of updates) {
      await db.from('menus').update({
        display_order: displayOrder,
        parent_id: parentId,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
    }

    revalidatePath('/app');
    return { success: true };
  } catch (error) {
    return { success: false, error: '메뉴 순서 변경에 실패했습니다.' };
  }
}

export async function getAllMenuItems(): Promise<MenuItem[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('menus')
    .select('*')
    .order('display_order', { ascending: true });

  if (error || !data) return [];

  return data.map((m) => ({
    id: m.id,
    parentId: m.parent_id,
    name: m.name,
    icon: m.icon,
    menuType: m.menu_type as MenuItem['menuType'],
    schemaId: m.schema_id,
    screenId: m.screen_id,
    flowId: m.flow_id,
    displayOrder: m.display_order,
    isVisible: m.is_visible,
  }));
}

export async function updateMenuItem(
  id: string,
  input: {
    name?: string;
    icon?: string | null;
    menuType?: MenuItem['menuType'];
    schemaId?: string | null;
    isVisible?: boolean;
    parentId?: string | null;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    await getCurrentUserId();
    const db = createAdminClient();

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.icon !== undefined) patch.icon = input.icon;
    if (input.menuType !== undefined) patch.menu_type = input.menuType;
    if (input.schemaId !== undefined) patch.schema_id = input.schemaId;
    if (input.isVisible !== undefined) patch.is_visible = input.isVisible;
    if (input.parentId !== undefined) patch.parent_id = input.parentId;

    const { error } = await db.from('menus').update(patch).eq('id', id);
    if (error) throw error;

    revalidatePath('/app');
    revalidatePath('/app/builder/menu');
    return { success: true };
  } catch {
    return { success: false, error: '메뉴 수정에 실패했습니다.' };
  }
}

export async function deleteMenuItem(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await getCurrentUserId();
    await deleteMenuRecursive(id);
    revalidatePath('/app');
    return { success: true };
  } catch (error) {
    return { success: false, error: '메뉴 삭제에 실패했습니다.' };
  }
}

async function deleteMenuRecursive(menuId: string): Promise<void> {
  const db = createAdminClient();
  const { data: children } = await db
    .from('menus')
    .select('id')
    .eq('parent_id', menuId);

  for (const child of children ?? []) {
    await deleteMenuRecursive(child.id);
  }
  await db.from('menus').delete().eq('id', menuId);
}
