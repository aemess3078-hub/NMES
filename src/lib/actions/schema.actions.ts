'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateId } from '@/lib/utils';
import { getCurrentUserId } from '@/lib/auth';
import type {
  CreateSchemaRequest,
  UpdateSchemaRequest,
  SchemaDefinition,
  FieldDefinition,
} from '@/types';

function deserializeSchema(raw: Record<string, unknown>): SchemaDefinition {
  return {
    id: raw.id as string,
    name: raw.name as string,
    description: raw.description as string | null,
    icon: raw.icon as string | null,
    color: raw.color as string | null,
    fields: (raw.fields as FieldDefinition[]) ?? [],
    relations: (raw.relations as []) ?? [],
    isTemplate: raw.is_template as boolean,
    isSystem: raw.is_system as boolean,
    displayOrder: raw.display_order as number,
    createdBy: raw.created_by as string,
    createdAt: new Date(raw.created_at as string),
    updatedAt: new Date(raw.updated_at as string),
  };
}

export async function getSchemas(): Promise<SchemaDefinition[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('schemas')
    .select('*')
    .order('display_order', { ascending: true });

  if (error || !data) return [];
  return data.map(deserializeSchema);
}

export async function getSchemaById(id: string): Promise<SchemaDefinition | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('schemas')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return null;
  return deserializeSchema(data);
}

export async function createSchema(
  request: CreateSchemaRequest
): Promise<{ success: boolean; schemaId?: string; error?: string }> {
  try {
    const userId = await getCurrentUserId();
    const db = createAdminClient();

    const { data: schema, error } = await db
      .from('schemas')
      .insert({
        id: crypto.randomUUID(),
        name: request.name,
        description: request.description ?? null,
        icon: request.icon ?? null,
        color: request.color ?? null,
        fields: request.fields,
        relations: request.relations,
        created_by: userId,
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) throw error;

    // 기준정보 폴더에 자동으로 메뉴 추가
    const { data: masterFolder } = await db
      .from('menus')
      .select('id')
      .eq('menu_type', 'FOLDER')
      .is('parent_id', null)
      .eq('name', '기준정보')
      .single();

    await db.from('menus').insert({
      id: crypto.randomUUID(),
      parent_id: masterFolder?.id ?? null,
      name: request.name,
      icon: request.icon ?? 'Table',
      menu_type: 'SCHEMA',
      schema_id: schema.id,
      display_order: 999,
      created_by: userId,
      updated_at: new Date().toISOString(),
    });

    revalidatePath('/app');
    return { success: true, schemaId: schema.id };
  } catch (error) {
    console.error('[createSchema]', error);
    return { success: false, error: error instanceof Error ? error.message : '스키마 생성에 실패했습니다.' };
  }
}

export async function updateSchema(
  id: string,
  request: UpdateSchemaRequest
): Promise<{ success: boolean; error?: string }> {
  try {
    await getCurrentUserId();
    const db = createAdminClient();

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (request.name !== undefined) updates.name = request.name;
    if (request.description !== undefined) updates.description = request.description;
    if (request.icon !== undefined) updates.icon = request.icon;
    if (request.color !== undefined) updates.color = request.color;
    if (request.fields !== undefined) updates.fields = request.fields;
    if (request.relations !== undefined) updates.relations = request.relations;
    if (request.displayOrder !== undefined) updates.display_order = request.displayOrder;

    const { error } = await db.from('schemas').update(updates).eq('id', id);
    if (error) throw error;

    if (request.name) {
      await db.from('menus').update({ name: request.name, updated_at: new Date().toISOString() }).eq('schema_id', id);
    }

    revalidatePath('/app');
    revalidatePath(`/app/data/${id}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : '스키마 수정에 실패했습니다.' };
  }
}

export async function deleteSchema(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await getCurrentUserId();
    const db = createAdminClient();

    const { data: schema } = await db.from('schemas').select('is_system').eq('id', id).single();
    if (schema?.is_system) return { success: false, error: '시스템 스키마는 삭제할 수 없습니다.' };

    await db.from('menus').delete().eq('schema_id', id);
    await db.from('schemas').delete().eq('id', id);

    revalidatePath('/app');
    return { success: true };
  } catch (error) {
    return { success: false, error: '스키마 삭제에 실패했습니다.' };
  }
}

export async function addFieldToSchema(
  schemaId: string,
  field: Omit<FieldDefinition, 'id'>
): Promise<{ success: boolean; error?: string }> {
  try {
    await getCurrentUserId();
    const db = createAdminClient();

    const { data: schema } = await db.from('schemas').select('fields').eq('id', schemaId).single();
    if (!schema) return { success: false, error: '스키마를 찾을 수 없습니다.' };

    const currentFields = (schema.fields as FieldDefinition[]) ?? [];
    const newField: FieldDefinition = { ...field, id: generateId() };

    await db.from('schemas').update({ fields: [...currentFields, newField], updated_at: new Date().toISOString() }).eq('id', schemaId);
    revalidatePath(`/app/builder/schemas/${schemaId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: '필드 추가에 실패했습니다.' };
  }
}

export async function updateFieldInSchema(
  schemaId: string,
  fieldId: string,
  updates: Partial<FieldDefinition>
): Promise<{ success: boolean; error?: string }> {
  try {
    await getCurrentUserId();
    const db = createAdminClient();

    const { data: schema } = await db.from('schemas').select('fields').eq('id', schemaId).single();
    if (!schema) return { success: false, error: '스키마를 찾을 수 없습니다.' };

    const currentFields = (schema.fields as FieldDefinition[]) ?? [];
    const updatedFields = currentFields.map((f) => f.id === fieldId ? { ...f, ...updates } : f);

    await db.from('schemas').update({ fields: updatedFields, updated_at: new Date().toISOString() }).eq('id', schemaId);
    revalidatePath(`/app/builder/schemas/${schemaId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: '필드 수정에 실패했습니다.' };
  }
}

export async function removeFieldFromSchema(
  schemaId: string,
  fieldId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await getCurrentUserId();
    const db = createAdminClient();

    const { data: schema } = await db.from('schemas').select('fields').eq('id', schemaId).single();
    if (!schema) return { success: false, error: '스키마를 찾을 수 없습니다.' };

    const currentFields = (schema.fields as FieldDefinition[]) ?? [];
    const updatedFields = currentFields.filter((f) => f.id !== fieldId);

    await db.from('schemas').update({ fields: updatedFields, updated_at: new Date().toISOString() }).eq('id', schemaId);
    revalidatePath(`/app/builder/schemas/${schemaId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: '필드 삭제에 실패했습니다.' };
  }
}

export async function reorderFieldsInSchema(
  schemaId: string,
  fieldIds: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    await getCurrentUserId();
    const db = createAdminClient();

    const { data: schema } = await db.from('schemas').select('fields').eq('id', schemaId).single();
    if (!schema) return { success: false, error: '스키마를 찾을 수 없습니다.' };

    const currentFields = (schema.fields as FieldDefinition[]) ?? [];
    const fieldMap = new Map(currentFields.map((f) => [f.id, f]));
    const reorderedFields = fieldIds
      .map((id, index) => { const f = fieldMap.get(id); return f ? { ...f, displayOrder: index } : null; })
      .filter(Boolean) as FieldDefinition[];

    await db.from('schemas').update({ fields: reorderedFields, updated_at: new Date().toISOString() }).eq('id', schemaId);
    return { success: true };
  } catch (error) {
    return { success: false, error: '필드 순서 변경에 실패했습니다.' };
  }
}
