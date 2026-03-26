'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUserId } from '@/lib/auth';
import type { RecordData, PaginatedResponse, SchemaRecord } from '@/types';

function deserializeRecord(raw: Record<string, unknown>): SchemaRecord {
  return {
    id: raw.id as string,
    schemaId: raw.schema_id as string,
    data: raw.data as RecordData,
    createdBy: raw.created_by as string,
    createdAt: new Date(raw.created_at as string),
    updatedAt: new Date(raw.updated_at as string),
    deletedAt: raw.deleted_at ? new Date(raw.deleted_at as string) : null,
  };
}

export async function getRecords(
  schemaId: string,
  options: { page?: number; pageSize?: number; search?: string } = {}
): Promise<PaginatedResponse<SchemaRecord>> {
  const { page = 1, pageSize = 20 } = options;
  const db = createAdminClient();

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await db
    .from('schema_records')
    .select('*', { count: 'exact' })
    .eq('schema_id', schemaId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error || !data) {
    return { items: [], total: 0, page, pageSize, hasNextPage: false };
  }

  const total = count ?? 0;
  return {
    items: data.map(deserializeRecord),
    total,
    page,
    pageSize,
    hasNextPage: from + data.length < total,
  };
}

export async function getRecordById(id: string): Promise<SchemaRecord | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('schema_records')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error || !data) return null;
  return deserializeRecord(data);
}

export async function createRecord(
  schemaId: string,
  data: RecordData
): Promise<{ success: boolean; recordId?: string; error?: string }> {
  try {
    const userId = await getCurrentUserId();
    const db = createAdminClient();

    const { data: record, error } = await db
      .from('schema_records')
      .insert({
        id: crypto.randomUUID(),
        schema_id: schemaId,
        data,
        created_by: userId,
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) throw error;
    revalidatePath(`/app/data/${schemaId}`);
    return { success: true, recordId: record.id };
  } catch (error) {
    console.error('[createRecord]', error);
    return { success: false, error: '데이터 저장에 실패했습니다.' };
  }
}

export async function updateRecord(
  id: string,
  data: Partial<RecordData>
): Promise<{ success: boolean; error?: string }> {
  try {
    await getCurrentUserId();
    const db = createAdminClient();

    const { data: existing } = await db
      .from('schema_records')
      .select('data, schema_id')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (!existing) return { success: false, error: '데이터를 찾을 수 없습니다.' };

    const mergedData = { ...(existing.data as RecordData), ...data };
    const { error } = await db
      .from('schema_records')
      .update({ data: mergedData, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
    revalidatePath(`/app/data/${existing.schema_id}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: '데이터 수정에 실패했습니다.' };
  }
}

export async function deleteRecord(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await getCurrentUserId();
    const db = createAdminClient();

    const { data: record } = await db
      .from('schema_records')
      .select('schema_id')
      .eq('id', id)
      .single();

    if (!record) return { success: false, error: '데이터를 찾을 수 없습니다.' };

    await db.from('schema_records').update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    revalidatePath(`/app/data/${record.schema_id}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: '데이터 삭제에 실패했습니다.' };
  }
}

export async function deleteRecords(ids: string[]): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    await getCurrentUserId();
    const db = createAdminClient();

    const { error } = await db
      .from('schema_records')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in('id', ids)
      .is('deleted_at', null);

    if (error) throw error;
    return { success: true, count: ids.length };
  } catch (error) {
    return { success: false, error: '데이터 삭제에 실패했습니다.' };
  }
}
