'use client';

/**
 * 필드 목록 (드래그앤드롭으로 순서 변경 가능)
 * dnd-kit Sortable 사용
 */

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Trash2,
  Star,
  Lock,
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
import { FIELD_TYPE_LABELS, type FieldDefinition, type FieldType } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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

// ============================================================
// 개별 정렬 가능한 필드 아이템
// ============================================================

interface SortableFieldItemProps {
  field: FieldDefinition;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function SortableFieldItem({
  field,
  isSelected,
  onSelect,
  onDelete,
}: SortableFieldItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon = FIELD_ICONS[field.type] ?? Type;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-center gap-2 p-3 rounded-md border bg-background cursor-pointer transition-all',
        isDragging && 'opacity-50 shadow-lg ring-2 ring-primary',
        isSelected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border hover:border-muted-foreground/50 hover:bg-muted/30'
      )}
      onClick={onSelect}
    >
      {/* 드래그 핸들 */}
      <div
        className="flex-shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* 타입 아이콘 */}
      <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />

      {/* 필드 정보 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{field.name}</span>
          {field.required && (
            <Star className="h-3 w-3 text-danger flex-shrink-0" fill="currentColor" />
          )}
          {field.unique && (
            <Lock className="h-3 w-3 text-amber-500 flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-muted-foreground font-mono truncate">
            {field.key}
          </span>
          <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 leading-none">
            {FIELD_TYPE_LABELS[field.type]}
          </Badge>
        </div>
      </div>

      {/* 삭제 버튼 */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 flex-shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ============================================================
// 전체 필드 목록
// ============================================================

export function FieldList() {
  const { fields, selectedFieldId, reorderFields, removeField, selectField } =
    useSchemaBuilderStore();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderFields(oldIndex, newIndex);
    }
  };

  if (fields.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
          <Type className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">
          필드가 없습니다
        </p>
        <p className="text-xs text-muted-foreground">
          오른쪽 패널에서 필드 타입을 클릭하여 추가하세요
        </p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={fields.map((f) => f.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {fields.map((field) => (
            <SortableFieldItem
              key={field.id}
              field={field}
              isSelected={selectedFieldId === field.id}
              onSelect={() => selectField(field.id)}
              onDelete={() => removeField(field.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
