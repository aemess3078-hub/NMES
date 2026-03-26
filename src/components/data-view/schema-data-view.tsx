'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus, Pencil, Trash2, Search, ArrowLeft,
  ChevronLeft, ChevronRight, Loader2, ScanSearch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RecordDetailDrawer } from '@/components/data-view/record-detail-drawer';
import { createRecord, updateRecord, deleteRecord } from '@/lib/actions/record.actions';
import type { SchemaDefinition, SchemaRecord, PaginatedResponse, RecordData } from '@/types';

// ─── Constants ─────────────────────────────────────────────────────────────────

const KEY_COLUMN_LIMIT = 5;

// ─── Cell value (table, truncated) ────────────────────────────────────────────

function formatCellValue(value: unknown, fieldType: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (fieldType === 'boolean') return value ? '예' : '아니오';
  if (fieldType === 'date' || fieldType === 'datetime') {
    try { return new Date(value as string).toLocaleDateString('ko-KR'); }
    catch { return String(value); }
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, 2).map(String);
    return items.join(', ') + (value.length > 2 ? ` +${value.length - 2}` : '');
  }
  const str = String(value);
  return str.length > 40 ? str.slice(0, 40) + '…' : str;
}

// ─── Edit form dialog ──────────────────────────────────────────────────────────

interface EditDialogProps {
  schema: SchemaDefinition;
  isOpen: boolean;
  editingRecord: SchemaRecord | null;
  formData: RecordData;
  isSaving: boolean;
  onClose: () => void;
  onSave: () => void;
  onFieldChange: (key: string, value: unknown) => void;
}

function EditDialog({
  schema,
  isOpen,
  editingRecord,
  formData,
  isSaving,
  onClose,
  onSave,
  onFieldChange,
}: EditDialogProps) {
  const visibleFields = schema.fields.filter((f) => !f.isHidden);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[18px]">
            {editingRecord ? `${schema.name} 수정` : `새 ${schema.name}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {visibleFields.map((field) => (
            <div key={field.id} className="space-y-1.5">
              <Label className="text-[14px]">
                {field.name}
                {field.required && <span className="text-destructive ml-0.5">*</span>}
                {field.helpText && (
                  <span className="text-[13px] text-muted-foreground ml-2 font-normal">
                    {field.helpText}
                  </span>
                )}
              </Label>
              {field.type === 'boolean' ? (
                <Switch
                  checked={!!formData[field.key]}
                  onCheckedChange={(v) => onFieldChange(field.key, v)}
                />
              ) : field.type === 'select' ? (
                <select
                  value={String(formData[field.key] ?? '')}
                  onChange={(e) => onFieldChange(field.key, e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">선택하세요</option>
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  value={String(formData[field.key] ?? '')}
                  onChange={(e) => onFieldChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-[14px] leading-[1.5] resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[72px]"
                />
              ) : (
                <Input
                  type={
                    field.type === 'number' ? 'number'
                    : field.type === 'date' ? 'date'
                    : field.type === 'datetime' ? 'datetime-local'
                    : 'text'
                  }
                  value={String(formData[field.key] ?? '')}
                  onChange={(e) => onFieldChange(field.key, e.target.value)}
                  placeholder={field.placeholder ?? `${field.name} 입력...`}
                  required={field.required}
                  className="h-9 text-[14px]"
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
          <Button size="sm" onClick={onSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isSaving ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface SchemaDataViewProps {
  schema: SchemaDefinition;
  records: PaginatedResponse<SchemaRecord>;
  currentPage: number;
  search?: string;
}

export function SchemaDataView({ schema, records, currentPage, search }: SchemaDataViewProps) {
  const router = useRouter();

  // Table / search
  const [searchValue, setSearchValue] = useState(search ?? '');

  // Drawer
  const [viewingRecord, setViewingRecord] = useState<SchemaRecord | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Edit dialog
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<SchemaRecord | null>(null);
  const [formData, setFormData] = useState<RecordData>({});
  const [isSaving, setIsSaving] = useState(false);

  const visibleFields = schema.fields.filter((f) => !f.isHidden);
  const keyFields = visibleFields.slice(0, KEY_COLUMN_LIMIT);
  const hiddenCount = visibleFields.length - keyFields.length;

  // ── Actions ──────────────────────────────────────────────────────────────────

  const openDetail = (record: SchemaRecord) => {
    setViewingRecord(record);
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    // keep viewingRecord until animation ends
    setTimeout(() => setViewingRecord(null), 300);
  };

  const openCreateForm = () => {
    setEditingRecord(null);
    setFormData({});
    setIsFormOpen(true);
  };

  const openEditForm = (record: SchemaRecord) => {
    setIsDrawerOpen(false);
    setEditingRecord(record);
    setFormData({ ...record.data });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    const result = editingRecord
      ? await updateRecord(editingRecord.id, formData)
      : await createRecord(schema.id, formData);
    setIsSaving(false);
    if (result.success) {
      setIsFormOpen(false);
      router.refresh();
    } else {
      alert(result.error ?? '저장에 실패했습니다.');
    }
  };

  const handleDelete = async (record: SchemaRecord) => {
    if (!confirm('이 데이터를 삭제하시겠습니까?')) return;
    closeDrawer();
    const result = await deleteRecord(record.id);
    if (result.success) router.refresh();
    else alert(result.error ?? '삭제에 실패했습니다.');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchValue) params.set('search', searchValue);
    router.push(`/app/data/${schema.id}?${params.toString()}`);
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-1">
          <Link href="/app">
            <button className="p-1 rounded hover:bg-accent text-muted-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
          </Link>
          <div
            className="w-6 h-6 rounded flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0"
            style={{ backgroundColor: schema.color ?? '#6366f1' }}
          >
            {schema.name[0]}
          </div>
          <h1 className="text-[28px] font-semibold leading-[1.2] tracking-tight">
            {schema.name}
          </h1>
          <Badge variant="secondary" className="font-normal">{records.total}건</Badge>
          <div className="ml-auto flex items-center gap-2">
            <Link href={`/app/builder/schemas/${schema.id}`}>
              <button className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-accent">
                <Pencil className="h-3 w-3" />
                스키마 편집
              </button>
            </Link>
            <Button size="sm" onClick={openCreateForm}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              새 데이터
            </Button>
          </div>
        </div>

        {schema.description && (
          <p className="text-[15px] leading-[1.5] text-muted-foreground mb-6 pl-[52px]">
            {schema.description}
          </p>
        )}

        {/* Search */}
        <div className="flex items-center gap-3 mb-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="검색..."
                className="h-9 pl-8 text-[14px] w-56 bg-muted/40 border-transparent focus:border-border focus:bg-background"
              />
            </div>
          </form>
          {search && (
            <button
              onClick={() => router.push(`/app/data/${schema.id}`)}
              className="text-[13px] text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              &ldquo;{search}&rdquo; 지우기 ×
            </button>
          )}
          {hiddenCount > 0 && (
            <span className="text-[13px] text-muted-foreground/60 ml-auto">
              목록에는 {keyFields.length}개 컬럼 표시 중 · 전체 {visibleFields.length}개 필드는 상세 보기에서 확인
            </span>
          )}
        </div>

        {/* Table */}
        {visibleFields.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[15px] leading-[1.5] text-muted-foreground">
              필드가 없습니다. 스키마 편집에서 필드를 추가하세요.
            </p>
          </div>
        ) : records.items.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-border rounded-lg">
            <p className="text-[15px] leading-[1.5] text-muted-foreground mb-3">
              {search ? `"${search}"에 대한 결과가 없습니다.` : '데이터가 없습니다.'}
            </p>
            {!search && (
              <Button variant="outline" size="sm" onClick={openCreateForm}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                첫 번째 데이터 입력
              </Button>
            )}
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table
                className="w-full text-[14px]"
                style={{ borderCollapse: 'separate', borderSpacing: 0 }}
              >
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-[13px] font-medium text-muted-foreground w-10 whitespace-nowrap">
                      #
                    </th>
                    {keyFields.map((field) => (
                      <th
                        key={field.id}
                        className="text-left px-4 py-2.5 text-[13px] font-medium text-muted-foreground whitespace-nowrap"
                      >
                        {field.name}
                        {field.required && (
                          <span className="text-destructive ml-0.5">*</span>
                        )}
                      </th>
                    ))}
                    {/* Sticky action header */}
                    <th className="px-4 py-2.5 text-[13px] font-medium text-muted-foreground text-right whitespace-nowrap sticky right-0 bg-muted/30 border-l border-border/50">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {records.items.map((record, idx) => (
                    <tr
                      key={record.id}
                      className="group hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-2.5 text-[13px] text-muted-foreground/50 whitespace-nowrap">
                        {(currentPage - 1) * records.pageSize + idx + 1}
                      </td>
                      {keyFields.map((field) => (
                        <td
                          key={field.id}
                          className="px-4 py-2.5 text-[14px] text-foreground max-w-[220px]"
                        >
                          {field.type === 'boolean' ? (
                            <span
                              className={
                                record.data[field.key]
                                  ? 'text-emerald-600'
                                  : 'text-muted-foreground'
                              }
                            >
                              {formatCellValue(record.data[field.key], field.type)}
                            </span>
                          ) : field.type === 'select' ? (
                            <Badge
                              variant="secondary"
                              className="text-[12px] font-normal"
                            >
                              {formatCellValue(record.data[field.key], field.type)}
                            </Badge>
                          ) : (
                            <span className="truncate block">
                              {formatCellValue(record.data[field.key], field.type)}
                            </span>
                          )}
                        </td>
                      ))}

                      {/* Sticky action cell */}
                      <td className="px-3 py-2.5 sticky right-0 bg-background group-hover:bg-muted/20 transition-colors border-l border-border/50">
                        <div className="flex items-center gap-0.5 justify-end">
                          <button
                            className="p-1.5 rounded hover:bg-accent text-muted-foreground/50 hover:text-foreground transition-colors"
                            onClick={() => openDetail(record)}
                            title="자세히 보기"
                          >
                            <ScanSearch className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="p-1.5 rounded hover:bg-accent text-muted-foreground/50 hover:text-foreground transition-colors"
                            onClick={() => openEditForm(record)}
                            title="수정"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground/50 hover:text-destructive transition-colors"
                            onClick={() => handleDelete(record)}
                            title="삭제"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {records.total > records.pageSize && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/10">
                <p className="text-[13px] text-muted-foreground">
                  {records.total}건 중{' '}
                  {(currentPage - 1) * records.pageSize + 1}–
                  {Math.min(currentPage * records.pageSize, records.total)}
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    disabled={currentPage <= 1}
                    onClick={() =>
                      router.push(`/app/data/${schema.id}?page=${currentPage - 1}`)
                    }
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-[13px] text-muted-foreground px-1">
                    {currentPage} / {Math.ceil(records.total / records.pageSize)}
                  </span>
                  <button
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    disabled={!records.hasNextPage}
                    onClick={() =>
                      router.push(`/app/data/${schema.id}?page=${currentPage + 1}`)
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Side drawer */}
      <RecordDetailDrawer
        schema={schema}
        record={viewingRecord}
        isOpen={isDrawerOpen}
        onClose={closeDrawer}
        onEdit={openEditForm}
        onDelete={handleDelete}
      />

      {/* Edit dialog */}
      <EditDialog
        schema={schema}
        isOpen={isFormOpen}
        editingRecord={editingRecord}
        formData={formData}
        isSaving={isSaving}
        onClose={() => setIsFormOpen(false)}
        onSave={handleSave}
        onFieldChange={(key, value) =>
          setFormData((d) => ({ ...d, [key]: value }))
        }
      />
    </>
  );
}
