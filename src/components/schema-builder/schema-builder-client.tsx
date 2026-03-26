'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSchemaBuilderStore } from '@/stores/schema-builder.store';
import { createSchema, updateSchema } from '@/lib/actions/schema.actions';
import { SchemaMetaForm } from './schema-meta-form';
import { FieldList } from './field-list';
import { FieldTypePalette } from './field-type-palette';
import { FieldEditor } from './field-editor';
import { Button } from '@/components/ui/button';
import type { SchemaDefinition } from '@/types';

interface SchemaBuilderClientProps {
  mode: 'create' | 'edit';
  initialSchema?: SchemaDefinition;
  allSchemas: Array<{ id: string; name: string }>;
}

export function SchemaBuilderClient({
  mode,
  initialSchema,
  allSchemas,
}: SchemaBuilderClientProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const {
    name,
    description,
    icon,
    color,
    fields,
    relations,
    isDirty,
    initFromSchema,
    initEmpty,
    markClean,
  } = useSchemaBuilderStore();

  useEffect(() => {
    if (mode === 'edit' && initialSchema) {
      initFromSchema(initialSchema);
    } else {
      initEmpty();
    }
  }, []);

  const handleSave = async () => {
    if (!name.trim()) {
      setSaveError('스키마 이름을 입력해주세요.');
      return;
    }

    setIsSaving(true);
    setSaveError('');

    const payload = { name: name.trim(), description, icon, color, fields, relations };

    const result =
      mode === 'create'
        ? await createSchema(payload)
        : await updateSchema(initialSchema!.id, payload);

    setIsSaving(false);

    if (result.success) {
      markClean();
      if (mode === 'create' && 'schemaId' in result) {
        router.push(`/app/builder/schemas/${result.schemaId}`);
      } else {
        router.refresh();
      }
    } else {
      setSaveError(result.error ?? '저장에 실패했습니다.');
    }
  };

  return (
    <div className="flex flex-col h-full -m-6">
      {/* 상단 툴바 */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-background">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href="/app/builder/schemas">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-[14px] font-semibold leading-[1.3]">
              {mode === 'create' ? '새 스키마 만들기' : `${name || '스키마'} 편집`}
            </h1>
            {isDirty && (
              <p className="text-[13px] text-amber-600">저장되지 않은 변경사항</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {saveError && (
            <p className="text-[13px] text-destructive">{saveError}</p>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {isSaving ? '저장 중...' : '저장'}
          </Button>
        </div>
      </div>

      {/* 스키마 메타 폼 (이름, 색상) */}
      <SchemaMetaForm />

      {/* 빌더 영역: 필드 목록 | 필드 속성 패널 | 필드 타입 팔레트 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 중앙: 필드 목록 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b bg-muted/20">
            <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide">
              필드 목록 ({fields.length}개)
            </p>
          </div>
          <FieldList />
        </div>

        {/* 우측: 필드 속성 편집기 */}
        <FieldEditor schemas={allSchemas} />

        {/* 맨 우측: 필드 타입 팔레트 */}
        <FieldTypePalette />
      </div>
    </div>
  );
}
