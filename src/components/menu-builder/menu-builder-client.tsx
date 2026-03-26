'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragMoveEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Hash,
  Table,
  Layout,
  GitBranch,
  Database,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  updateMenuOrder,
} from '@/lib/actions/menu.actions';
import type { MenuTree, MenuType } from '@/types/menu';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlattenedItem {
  id: string;
  parentId: string | null;
  depth: number;
  name: string;
  icon: string | null;
  menuType: MenuType;
  schemaId: string | null;
  isVisible: boolean;
  displayOrder: number;
}

interface SchemaOption {
  id: string;
  name: string;
}

interface MenuBuilderClientProps {
  initialTree: MenuTree[];
  schemas: SchemaOption[];
}

// ─── Tree helpers ──────────────────────────────────────────────────────────────

function flattenTree(
  items: MenuTree[],
  parentId: string | null = null,
  depth = 0,
  collapsed: Set<string> = new Set()
): FlattenedItem[] {
  return items.flatMap((item) => {
    const flat: FlattenedItem = {
      id: item.id,
      parentId,
      depth,
      name: item.name,
      icon: item.icon,
      menuType: item.menuType as MenuType,
      schemaId: item.schemaId,
      isVisible: item.isVisible,
      displayOrder: item.displayOrder,
    };
    if (item.children.length > 0 && !collapsed.has(item.id)) {
      return [flat, ...flattenTree(item.children, item.id, depth + 1, collapsed)];
    }
    return [flat];
  });
}

function getProjection(
  items: FlattenedItem[],
  activeId: string,
  overId: string,
  dragOffsetLeft: number,
  indentationWidth: number
): { depth: number; parentId: string | null } {
  const overIndex = items.findIndex((i) => i.id === overId);
  const activeIndex = items.findIndex((i) => i.id === activeId);
  const activeItem = items[activeIndex];
  const newItems = arrayMove(items, activeIndex, overIndex);
  const previousItem = newItems[overIndex - 1];
  const nextItem = newItems[overIndex + 1];
  const dragDepth = activeItem.depth + Math.round(dragOffsetLeft / indentationWidth);

  // Only allow nesting inside FOLDER type
  const maxDepth = previousItem
    ? previousItem.menuType === 'FOLDER'
      ? previousItem.depth + 1
      : previousItem.depth
    : 0;
  const minDepth = nextItem ? nextItem.depth : 0;
  const depth = Math.max(minDepth, Math.min(dragDepth, maxDepth));

  let parentId: string | null = null;
  if (depth > 0) {
    for (let i = overIndex - 1; i >= 0; i--) {
      if (newItems[i].depth === depth - 1) {
        parentId = newItems[i].id;
        break;
      }
    }
  }

  return { depth, parentId };
}

// ─── Icon helpers ──────────────────────────────────────────────────────────────

const ICON_OPTIONS = ['Folder', 'Table', 'Layout', 'GitBranch', 'Hash', 'Database'] as const;

function MenuIcon({
  name,
  isFolder,
  isExpanded,
  className,
}: {
  name?: string | null;
  isFolder?: boolean;
  isExpanded?: boolean;
  className?: string;
}) {
  if (isFolder) {
    return isExpanded ? (
      <FolderOpen className={cn('h-3.5 w-3.5', className)} />
    ) : (
      <Folder className={cn('h-3.5 w-3.5', className)} />
    );
  }
  const iconMap: Record<string, React.ElementType> = {
    Table,
    Layout,
    GitBranch,
    Hash,
    Folder,
    FolderOpen,
    Database,
  };
  const Icon = (name && iconMap[name]) ? iconMap[name] : Hash;
  return <Icon className={cn('h-3.5 w-3.5', className)} />;
}

// ─── Sortable Item ─────────────────────────────────────────────────────────────

interface SortableItemProps {
  item: FlattenedItem;
  isExpanded: boolean;
  projected: { depth: number; parentId: string | null } | null;
  isActive: boolean;
  onToggle: (id: string) => void;
  onEdit: (item: FlattenedItem) => void;
  onDelete: (item: FlattenedItem) => void;
  onToggleVisible: (item: FlattenedItem) => void;
}

function SortableItem({
  item,
  isExpanded,
  projected,
  isActive,
  onToggle,
  onEdit,
  onDelete,
  onToggleVisible,
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const depth = isActive && projected ? projected.depth : item.depth;

  if (item.menuType === 'DIVIDER') {
    return (
      <div
        ref={setNodeRef}
        style={{ ...style, paddingLeft: `${depth * 20 + 28}px` }}
        className={cn(
          'flex items-center gap-2 h-8 rounded group',
          isDragging && 'opacity-40'
        )}
      >
        <button
          className="p-1 cursor-grab text-muted-foreground/30 hover:text-muted-foreground/60 flex-shrink-0"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1 h-px bg-border" />
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground/40 hover:text-destructive transition-colors"
            onClick={() => onDelete(item)}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('rounded group', isDragging && 'opacity-40')}
    >
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-accent/50 transition-colors"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {/* Drag handle */}
        <button
          className="p-0.5 cursor-grab text-muted-foreground/30 hover:text-muted-foreground/60 flex-shrink-0 -ml-0.5"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        {/* Expand/collapse */}
        {item.menuType === 'FOLDER' ? (
          <button
            className="p-0.5 text-muted-foreground/50 hover:text-muted-foreground flex-shrink-0"
            onClick={() => onToggle(item.id)}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        {/* Icon */}
        <MenuIcon
          name={item.icon}
          isFolder={item.menuType === 'FOLDER'}
          isExpanded={isExpanded}
          className="text-muted-foreground/50 flex-shrink-0"
        />

        {/* Name */}
        <span
          className={cn(
            'flex-1 text-[14px] truncate',
            item.isVisible ? 'text-foreground' : 'text-muted-foreground/50 line-through'
          )}
        >
          {item.name}
        </span>

        {/* Type badge */}
        <span className="text-[12px] text-muted-foreground/40 hidden sm:block flex-shrink-0">
          {item.menuType === 'FOLDER' && '폴더'}
          {item.menuType === 'SCHEMA' && '스키마'}
          {item.menuType === 'SCREEN' && '화면'}
          {item.menuType === 'FLOW' && '플로우'}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            className="p-1 rounded hover:bg-accent text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            onClick={() => onToggleVisible(item)}
          >
            {item.isVisible ? (
              <Eye className="h-3 w-3" />
            ) : (
              <EyeOff className="h-3 w-3" />
            )}
          </button>
          <button
            className="p-1 rounded hover:bg-accent text-muted-foreground/50 hover:text-foreground transition-colors"
            onClick={() => onEdit(item)}
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground/50 hover:text-destructive transition-colors"
            onClick={() => onDelete(item)}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add / Edit Dialog ─────────────────────────────────────────────────────────

interface EditDialogProps {
  open: boolean;
  onClose: () => void;
  item?: FlattenedItem | null; // null = create mode
  folders: FlattenedItem[];
  schemas: SchemaOption[];
  onSaved: () => void;
}

function EditDialog({ open, onClose, item, folders, schemas, onSaved }: EditDialogProps) {
  const isEdit = !!item;

  const [name, setName] = useState(item?.name ?? '');
  const [icon, setIcon] = useState(item?.icon ?? '');
  const [menuType, setMenuType] = useState<MenuType>(item?.menuType ?? 'FOLDER');
  const [schemaId, setSchemaId] = useState(item?.schemaId ?? '');
  const [isVisible, setIsVisible] = useState(item?.isVisible ?? true);
  const [parentId, setParentId] = useState<string>(item?.parentId ?? '');
  const [saving, setSaving] = useState(false);

  // Reset when dialog opens with new item
  useEffect(() => {
    if (open) {
      setName(item?.name ?? '');
      setIcon(item?.icon ?? '');
      setMenuType(item?.menuType ?? 'FOLDER');
      setSchemaId(item?.schemaId ?? '');
      setIsVisible(item?.isVisible ?? true);
      setParentId(item?.parentId ?? '');
    }
  }, [open, item]);

  const handleSave = async () => {
    if (menuType !== 'DIVIDER' && !name.trim()) return;
    setSaving(true);

    let result;
    if (isEdit && item) {
      result = await updateMenuItem(item.id, {
        name: menuType === 'DIVIDER' ? '—' : name.trim(),
        icon: icon.trim() || null,
        menuType,
        schemaId: menuType === 'SCHEMA' ? schemaId || null : null,
        isVisible,
        parentId: parentId || null,
      });
    } else {
      result = await createMenuItem({
        name: menuType === 'DIVIDER' ? '—' : name.trim(),
        icon: icon.trim() || undefined,
        menuType,
        schemaId: menuType === 'SCHEMA' ? schemaId || undefined : undefined,
        parentId: parentId || undefined,
      });
    }

    setSaving(false);
    if (result.success) {
      onSaved();
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[18px]">
            {isEdit ? '메뉴 편집' : '메뉴 항목 추가'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type */}
          <div className="space-y-1.5">
            <Label className="text-[14px]">유형</Label>
            <div className="flex gap-2 flex-wrap">
              {(['FOLDER', 'SCHEMA', 'DIVIDER'] as MenuType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setMenuType(t)}
                  className={cn(
                    'px-3 py-1 text-[13px] rounded border transition-colors',
                    menuType === t
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border text-muted-foreground hover:border-foreground/40'
                  )}
                >
                  {t === 'FOLDER' && '폴더'}
                  {t === 'SCHEMA' && '스키마'}
                  {t === 'DIVIDER' && '구분선'}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          {menuType !== 'DIVIDER' && (
            <div className="space-y-1.5">
              <Label className="text-[14px]">이름</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="메뉴 이름"
                className="h-9 text-[14px]"
                autoFocus
              />
            </div>
          )}

          {/* Schema target */}
          {menuType === 'SCHEMA' && (
            <div className="space-y-1.5">
              <Label className="text-[14px]">스키마</Label>
              <select
                value={schemaId}
                onChange={(e) => setSchemaId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">스키마 선택...</option>
                {schemas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Icon */}
          {menuType !== 'DIVIDER' && (
            <div className="space-y-1.5">
              <Label className="text-[14px]">
                아이콘
                <span className="text-[13px] text-muted-foreground font-normal ml-2">
                  Lucide 아이콘 이름 (선택)
                </span>
              </Label>
              <div className="flex gap-2">
                <Input
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="예: Database, Table, GitBranch..."
                  className="h-9 text-[14px] flex-1"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {ICON_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setIcon(opt)}
                    className={cn(
                      'px-2 py-0.5 text-[12px] rounded border transition-colors',
                      icon === opt
                        ? 'border-foreground bg-foreground/5'
                        : 'border-border text-muted-foreground hover:border-muted-foreground'
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Parent */}
          {folders.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-[14px]">상위 폴더</Label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">최상위</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {'  '.repeat(f.depth)}{f.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Visibility */}
          {menuType !== 'DIVIDER' && (
            <div className="flex items-center justify-between">
              <Label className="text-[14px]">사이드바에 표시</Label>
              <Switch checked={isVisible} onCheckedChange={setIsVisible} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            취소
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : isEdit ? '저장' : '추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

const INDENTATION_WIDTH = 20;

export function MenuBuilderClient({ initialTree, schemas }: MenuBuilderClientProps) {
  const router = useRouter();
  const [tree, setTree] = useState<MenuTree[]>(initialTree);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);
  const [editingItem, setEditingItem] = useState<FlattenedItem | null | undefined>(undefined);
  // undefined = closed, null = create mode, FlattenedItem = edit mode

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // All items flattened (for DnD & logic)
  const flatItems = useMemo(() => flattenTree(tree, null, 0, collapsed), [tree, collapsed]);

  // Projected position during drag
  const projected = useMemo(() => {
    if (!activeId || !overId) return null;
    return getProjection(flatItems, activeId, overId, offsetLeft, INDENTATION_WIDTH);
  }, [activeId, overId, offsetLeft, flatItems]);

  const activeItem = activeId ? flatItems.find((i) => i.id === activeId) : null;
  const folders = flatItems.filter((i) => i.menuType === 'FOLDER');

  const handleToggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleToggleVisible = async (item: FlattenedItem) => {
    await updateMenuItem(item.id, { isVisible: !item.isVisible });
    router.refresh();
  };

  const handleDelete = async (item: FlattenedItem) => {
    if (!confirm(`"${item.menuType === 'DIVIDER' ? '구분선' : item.name}"을(를) 삭제하시겠습니까?`)) return;
    await deleteMenuItem(item.id);
    router.refresh();
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    setOverId(String(active.id));
  };

  const handleDragMove = ({ delta }: DragMoveEvent) => {
    setOffsetLeft(delta.x);
  };

  const handleDragOver = ({ over }: DragOverEvent) => {
    setOverId(over ? String(over.id) : null);
  };

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || !projected) {
      resetDrag();
      return;
    }

    const activeIndex = flatItems.findIndex((i) => i.id === String(active.id));
    const overIndex = flatItems.findIndex((i) => i.id === String(over.id));

    const movedItems = arrayMove(flatItems, activeIndex, overIndex).map((item, idx) => ({
      ...item,
      parentId: item.id === String(active.id) ? projected.parentId : item.parentId,
      displayOrder: idx,
    }));

    // Optimistically update tree
    const rebuildTree = buildFlatToTree(movedItems);
    setTree(rebuildTree);
    resetDrag();

    // Persist
    await updateMenuOrder(
      movedItems.map((i) => ({ id: i.id, displayOrder: i.displayOrder, parentId: i.parentId }))
    );
    router.refresh();
  };

  const resetDrag = () => {
    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);
  };

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditingItem(null)}
          className="text-[13px]"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          항목 추가
        </Button>
        {flatItems.length > 0 && (
          <span className="text-[13px] text-muted-foreground ml-auto">
            {flatItems.length}개 항목
          </span>
        )}
      </div>

      {/* Tree */}
      {flatItems.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-border rounded-lg">
          <p className="text-[15px] text-muted-foreground mb-3">메뉴가 없습니다</p>
          <Button size="sm" variant="outline" onClick={() => setEditingItem(null)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            첫 항목 추가
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={resetDrag}
        >
          <SortableContext items={flatItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
              {flatItems.map((item) => (
                <SortableItem
                  key={item.id}
                  item={item}
                  isExpanded={!collapsed.has(item.id)}
                  projected={item.id === activeId ? projected : null}
                  isActive={item.id === activeId}
                  onToggle={handleToggleCollapse}
                  onEdit={setEditingItem}
                  onDelete={handleDelete}
                  onToggleVisible={handleToggleVisible}
                />
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeItem && (
              <div className="bg-background border border-border rounded shadow-lg px-3 py-2 flex items-center gap-2 opacity-90">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                <MenuIcon
                  name={activeItem.icon}
                  isFolder={activeItem.menuType === 'FOLDER'}
                  isExpanded={false}
                  className="text-muted-foreground"
                />
                <span className="text-[14px]">{activeItem.name}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Edit / Add Dialog */}
      <EditDialog
        open={editingItem !== undefined}
        onClose={() => setEditingItem(undefined)}
        item={editingItem ?? null}
        folders={folders}
        schemas={schemas}
        onSaved={() => router.refresh()}
      />
    </>
  );
}

// ─── Rebuild tree from flat ────────────────────────────────────────────────────

function buildFlatToTree(items: FlattenedItem[]): MenuTree[] {
  const map = new Map<string, MenuTree>();
  const roots: MenuTree[] = [];

  for (const item of items) {
    map.set(item.id, {
      id: item.id,
      parentId: item.parentId,
      name: item.name,
      icon: item.icon,
      menuType: item.menuType,
      schemaId: item.schemaId,
      screenId: null,
      flowId: null,
      displayOrder: item.displayOrder,
      isVisible: item.isVisible,
      children: [],
    });
  }

  for (const item of items) {
    const node = map.get(item.id)!;
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
