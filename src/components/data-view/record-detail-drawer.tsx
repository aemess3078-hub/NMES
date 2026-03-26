'use client';

import { X, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SchemaDefinition, SchemaRecord } from '@/types';

// ─── Value renderer ────────────────────────────────────────────────────────────

function FieldValue({ value, fieldType }: { value: unknown; fieldType: string }) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-muted-foreground/40 text-[14px]">—</span>;
  }

  if (fieldType === 'boolean') {
    return (
      <span className={cn('text-[14px]', value ? 'text-emerald-600' : 'text-muted-foreground')}>
        {value ? '예' : '아니오'}
      </span>
    );
  }

  if (fieldType === 'date') {
    try {
      return (
        <span className="text-[14px]">
          {new Date(value as string).toLocaleDateString('ko-KR', {
            year: 'numeric', month: 'long', day: 'numeric',
          })}
        </span>
      );
    } catch {
      return <span className="text-[14px]">{String(value)}</span>;
    }
  }

  if (fieldType === 'datetime') {
    try {
      return (
        <span className="text-[14px]">
          {new Date(value as string).toLocaleString('ko-KR')}
        </span>
      );
    } catch {
      return <span className="text-[14px]">{String(value)}</span>;
    }
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground/40 text-[14px]">—</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {value.map((v, i) => (
          <Badge key={i} variant="secondary" className="text-[13px] font-normal">
            {String(v)}
          </Badge>
        ))}
      </div>
    );
  }

  if (fieldType === 'select') {
    return (
      <Badge variant="secondary" className="text-[13px] font-normal">
        {String(value)}
      </Badge>
    );
  }

  if (fieldType === 'textarea') {
    return (
      <p className="text-[14px] leading-[1.6] whitespace-pre-wrap text-foreground">
        {String(value)}
      </p>
    );
  }

  if (fieldType === 'number') {
    return (
      <span className="text-[14px] tabular-nums">
        {Number(value).toLocaleString('ko-KR')}
      </span>
    );
  }

  return <span className="text-[14px]">{String(value)}</span>;
}

// ─── Drawer ────────────────────────────────────────────────────────────────────

interface RecordDetailDrawerProps {
  schema: SchemaDefinition;
  record: SchemaRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (record: SchemaRecord) => void;
  onDelete: (record: SchemaRecord) => void;
}

export function RecordDetailDrawer({
  schema,
  record,
  isOpen,
  onClose,
  onEdit,
  onDelete,
}: RecordDetailDrawerProps) {
  const visibleFields = schema.fields.filter((f) => !f.isHidden);
  const firstField = visibleFields[0];
  const recordLabel = record && firstField
    ? String(record.data[firstField.key] ?? '')
    : '';

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/20 transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex flex-col',
          'w-full sm:w-[520px] lg:w-[560px]',
          'bg-background border-l border-border shadow-2xl',
          'transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border flex-shrink-0">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0"
            style={{ backgroundColor: schema.color ?? '#6366f1' }}
          >
            {schema.name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-muted-foreground leading-tight">{schema.name}</p>
            <p className="text-[15px] font-semibold leading-snug truncate">
              {recordLabel || '상세 보기'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {record && (
            <div className="px-6 py-5 space-y-0">
              {visibleFields.map((field, idx) => (
                <div
                  key={field.id}
                  className={cn(
                    'grid gap-x-4 py-3.5',
                    'grid-cols-[160px_1fr]',
                    idx < visibleFields.length - 1 && 'border-b border-border/60'
                  )}
                >
                  <dt className="text-[13px] text-muted-foreground leading-[1.5] pt-0.5 flex-shrink-0">
                    {field.name}
                    {field.required && (
                      <span className="text-destructive ml-0.5 text-[11px]">*</span>
                    )}
                  </dt>
                  <dd>
                    <FieldValue value={record.data[field.key]} fieldType={field.type} />
                    {field.helpText && (
                      <p className="text-[12px] text-muted-foreground/60 mt-0.5">
                        {field.helpText}
                      </p>
                    )}
                  </dd>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-6 py-4 border-t border-border flex-shrink-0 bg-muted/20">
          {record && (
            <>
              <Button size="sm" onClick={() => onEdit(record)}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                수정
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/20"
                onClick={() => onDelete(record)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                삭제
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose} className="ml-auto text-muted-foreground">
                닫기
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
