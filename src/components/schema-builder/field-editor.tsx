'use client';

/**
 * 필드 속성 편집 패널
 * 선택된 필드의 이름, 키, 타입별 옵션을 편집합니다.
 */

import { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useSchemaBuilderStore } from '@/stores/schema-builder.store';
import { toSnakeCase } from '@/lib/utils';
import { FIELD_TYPE_LABELS, type FieldDefinition } from '@/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

interface FieldEditorProps {
  schemas?: Array<{ id: string; name: string }>;
}

export function FieldEditor({ schemas = [] }: FieldEditorProps) {
  const { fields, selectedFieldId, updateField, selectField } =
    useSchemaBuilderStore();

  const field = fields.find((f) => f.id === selectedFieldId);

  if (!field) {
    return (
      <div className="w-72 flex-shrink-0 border-l bg-muted/20 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          필드를 선택하면
        </p>
        <p className="text-sm text-muted-foreground">
          속성을 편집할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="w-72 flex-shrink-0 border-l bg-background overflow-y-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <p className="text-sm font-semibold">필드 속성</p>
          <Badge variant="outline" className="text-xs mt-0.5">
            {FIELD_TYPE_LABELS[field.type]}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => selectField(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 space-y-5">
        {/* 기본 정보 */}
        <FieldBasicProperties field={field} onUpdate={updateField} />

        <Separator />

        {/* 유효성 검사 */}
        <FieldConstraints field={field} onUpdate={updateField} />

        {/* select/multiselect 옵션 */}
        {(field.type === 'select' || field.type === 'multiselect') && (
          <>
            <Separator />
            <SelectOptionsEditor field={field} onUpdate={updateField} />
          </>
        )}

        {/* relation 옵션 */}
        {field.type === 'relation' && (
          <>
            <Separator />
            <RelationEditor field={field} onUpdate={updateField} schemas={schemas} />
          </>
        )}

        {/* number 범위 */}
        {field.type === 'number' && (
          <>
            <Separator />
            <NumberRangeEditor field={field} onUpdate={updateField} />
          </>
        )}

        {/* text/textarea 길이 */}
        {(field.type === 'text' || field.type === 'textarea') && (
          <>
            <Separator />
            <TextLengthEditor field={field} onUpdate={updateField} />
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 기본 속성 (이름, 키)
// ============================================================

function FieldBasicProperties({
  field,
  onUpdate,
}: {
  field: FieldDefinition;
  onUpdate: (id: string, updates: Partial<FieldDefinition>) => void;
}) {
  const [localName, setLocalName] = useState(field.name);
  const [localKey, setLocalKey] = useState(field.key);
  const [keyManuallyEdited, setKeyManuallyEdited] = useState(false);

  // 선택된 필드가 바뀌면 로컬 상태 초기화
  useEffect(() => {
    setLocalName(field.name);
    setLocalKey(field.key);
    setKeyManuallyEdited(false);
  }, [field.id]);

  const handleNameChange = (value: string) => {
    setLocalName(value);
    if (!keyManuallyEdited) {
      const generatedKey = toSnakeCase(value) || 'field';
      setLocalKey(generatedKey);
      onUpdate(field.id, { name: value, key: generatedKey });
    } else {
      onUpdate(field.id, { name: value });
    }
  };

  const handleKeyChange = (value: string) => {
    setKeyManuallyEdited(true);
    const normalized = toSnakeCase(value);
    setLocalKey(normalized);
    onUpdate(field.id, { key: normalized });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="field-name" className="text-xs">
          필드 이름 <span className="text-danger">*</span>
        </Label>
        <Input
          id="field-name"
          value={localName}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="예: 품목코드"
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="field-key" className="text-xs">
          필드 키 (영문)
          <span className="text-muted-foreground ml-1 font-normal">
            데이터 저장 키
          </span>
        </Label>
        <Input
          id="field-key"
          value={localKey}
          onChange={(e) => handleKeyChange(e.target.value)}
          placeholder="예: item_code"
          className="h-8 text-sm font-mono"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="field-placeholder" className="text-xs">
          플레이스홀더
        </Label>
        <Input
          id="field-placeholder"
          value={field.placeholder ?? ''}
          onChange={(e) =>
            onUpdate(field.id, { placeholder: e.target.value || undefined })
          }
          placeholder="입력 힌트 텍스트"
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="field-help" className="text-xs">
          도움말 텍스트
        </Label>
        <Input
          id="field-help"
          value={field.helpText ?? ''}
          onChange={(e) =>
            onUpdate(field.id, { helpText: e.target.value || undefined })
          }
          placeholder="필드 아래 표시될 설명"
          className="h-8 text-sm"
        />
      </div>
    </div>
  );
}

// ============================================================
// 제약 조건 (필수, 중복불가)
// ============================================================

function FieldConstraints({
  field,
  onUpdate,
}: {
  field: FieldDefinition;
  onUpdate: (id: string, updates: Partial<FieldDefinition>) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        제약 조건
      </p>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs font-medium">필수 입력</Label>
          <p className="text-xs text-muted-foreground">빈 값 허용 안함</p>
        </div>
        <Switch
          checked={field.required}
          onCheckedChange={(checked) =>
            onUpdate(field.id, { required: checked })
          }
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs font-medium">중복 불가</Label>
          <p className="text-xs text-muted-foreground">고유 값 강제</p>
        </div>
        <Switch
          checked={field.unique}
          onCheckedChange={(checked) => onUpdate(field.id, { unique: checked })}
        />
      </div>
    </div>
  );
}

// ============================================================
// Select 옵션 편집
// ============================================================

function SelectOptionsEditor({
  field,
  onUpdate,
}: {
  field: FieldDefinition;
  onUpdate: (id: string, updates: Partial<FieldDefinition>) => void;
}) {
  const [newOption, setNewOption] = useState('');

  const options = field.options ?? [];

  const addOption = () => {
    const trimmed = newOption.trim();
    if (!trimmed || options.includes(trimmed)) return;
    onUpdate(field.id, { options: [...options, trimmed] });
    setNewOption('');
  };

  const removeOption = (option: string) => {
    onUpdate(field.id, { options: options.filter((o) => o !== option) });
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        선택지
      </p>

      <div className="flex gap-2">
        <Input
          value={newOption}
          onChange={(e) => setNewOption(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addOption()}
          placeholder="옵션 추가..."
          className="h-8 text-sm flex-1"
        />
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8 flex-shrink-0"
          onClick={addOption}
          disabled={!newOption.trim()}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">
          선택지를 추가하세요
        </p>
      ) : (
        <div className="space-y-1">
          {options.map((option) => (
            <div
              key={option}
              className="flex items-center justify-between py-1.5 px-2.5 bg-muted rounded-md"
            >
              <span className="text-xs truncate">{option}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:text-destructive flex-shrink-0"
                onClick={() => removeOption(option)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Relation 편집
// ============================================================

function RelationEditor({
  field,
  onUpdate,
  schemas,
}: {
  field: FieldDefinition;
  onUpdate: (id: string, updates: Partial<FieldDefinition>) => void;
  schemas: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        관계 설정
      </p>

      <div className="space-y-1.5">
        <Label className="text-xs">참조할 스키마</Label>
        <Select
          value={field.relatedSchemaId ?? ''}
          onValueChange={(value) =>
            onUpdate(field.id, { relatedSchemaId: value || undefined })
          }
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="스키마 선택..." />
          </SelectTrigger>
          <SelectContent>
            {schemas.map((schema) => (
              <SelectItem key={schema.id} value={schema.id}>
                {schema.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ============================================================
// Number 범위
// ============================================================

function NumberRangeEditor({
  field,
  onUpdate,
}: {
  field: FieldDefinition;
  onUpdate: (id: string, updates: Partial<FieldDefinition>) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        범위 제한
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">최솟값</Label>
          <Input
            type="number"
            value={field.validation?.min ?? ''}
            onChange={(e) =>
              onUpdate(field.id, {
                validation: {
                  ...field.validation,
                  min: e.target.value ? Number(e.target.value) : undefined,
                },
              })
            }
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">최댓값</Label>
          <Input
            type="number"
            value={field.validation?.max ?? ''}
            onChange={(e) =>
              onUpdate(field.id, {
                validation: {
                  ...field.validation,
                  max: e.target.value ? Number(e.target.value) : undefined,
                },
              })
            }
            className="h-8 text-sm"
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Text 길이
// ============================================================

function TextLengthEditor({
  field,
  onUpdate,
}: {
  field: FieldDefinition;
  onUpdate: (id: string, updates: Partial<FieldDefinition>) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        길이 제한
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">최소 길이</Label>
          <Input
            type="number"
            value={field.validation?.minLength ?? ''}
            onChange={(e) =>
              onUpdate(field.id, {
                validation: {
                  ...field.validation,
                  minLength: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                },
              })
            }
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">최대 길이</Label>
          <Input
            type="number"
            value={field.validation?.maxLength ?? ''}
            onChange={(e) =>
              onUpdate(field.id, {
                validation: {
                  ...field.validation,
                  maxLength: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                },
              })
            }
            className="h-8 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
