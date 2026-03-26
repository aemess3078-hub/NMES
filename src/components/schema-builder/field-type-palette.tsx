'use client';

/**
 * 필드 타입 팔레트
 * 드래그 또는 클릭으로 스키마에 필드를 추가하는 사이드 패널
 */

import {
  Type,
  Hash,
  Calendar,
  Clock,
  CheckSquare,
  ChevronDown,
  ListChecks,
  Link,
  Paperclip,
  AlignLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSchemaBuilderStore } from '@/stores/schema-builder.store';
import { FIELD_TYPE_LABELS, type FieldType } from '@/types';

const FIELD_ICONS: Record<FieldType, React.ElementType> = {
  text: Type,
  number: Hash,
  date: Calendar,
  datetime: Clock,
  boolean: CheckSquare,
  select: ChevronDown,
  multiselect: ListChecks,
  relation: Link,
  file: Paperclip,
  textarea: AlignLeft,
};

const FIELD_COLORS: Record<FieldType, string> = {
  text: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100',
  number: 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100',
  date: 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100',
  datetime: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100',
  boolean: 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100',
  select: 'bg-pink-50 border-pink-200 text-pink-700 hover:bg-pink-100',
  multiselect: 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100',
  relation: 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100',
  file: 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100',
  textarea: 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100',
};

const FIELD_DESCRIPTIONS: Record<FieldType, string> = {
  text: '짧은 텍스트 입력',
  number: '정수 또는 소수',
  date: '날짜 선택',
  datetime: '날짜+시간',
  boolean: 'ON/OFF 체크박스',
  select: '단일 선택 드롭다운',
  multiselect: '복수 항목 선택',
  relation: '다른 스키마 참조',
  file: '파일/이미지 첨부',
  textarea: '긴 텍스트 입력',
};

const FIELD_TYPE_ORDER: FieldType[] = [
  'text',
  'number',
  'textarea',
  'date',
  'datetime',
  'boolean',
  'select',
  'multiselect',
  'relation',
  'file',
];

export function FieldTypePalette() {
  const { addField } = useSchemaBuilderStore();

  return (
    <div className="w-52 flex-shrink-0 border-l bg-muted/30 p-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 px-1">
        필드 추가
      </p>
      <p className="text-xs text-muted-foreground mb-3 px-1">
        클릭하여 필드를 추가하세요
      </p>

      <div className="space-y-1.5">
        {FIELD_TYPE_ORDER.map((type) => {
          const Icon = FIELD_ICONS[type];
          return (
            <button
              key={type}
              onClick={() => addField(type)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-md border text-xs font-medium transition-all cursor-pointer',
                FIELD_COLORS[type]
              )}
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0" />
              <div className="text-left min-w-0">
                <div className="font-medium leading-none">
                  {FIELD_TYPE_LABELS[type]}
                </div>
                <div className="text-[10px] opacity-70 mt-0.5 truncate">
                  {FIELD_DESCRIPTIONS[type]}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
