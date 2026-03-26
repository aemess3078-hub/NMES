'use client';

/**
 * 스키마 메타데이터 폼 (이름, 설명, 아이콘, 색상)
 */

import { useSchemaBuilderStore } from '@/stores/schema-builder.store';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ICON_OPTIONS = [
  'Table', 'Database', 'Package', 'Building2', 'Users',
  'Cog', 'GitBranch', 'List', 'FileText', 'ShoppingCart',
  'Truck', 'Factory', 'BarChart', 'ClipboardList', 'Boxes',
];

const COLOR_OPTIONS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#64748b',
];

export function SchemaMetaForm() {
  const { name, description, icon, color, setName, setDescription, setIcon, setColor } =
    useSchemaBuilderStore();

  return (
    <div className="border-b bg-muted/20 px-6 py-4">
      <div className="flex gap-4 items-start">
        {/* 색상 + 아이콘 미리보기 */}
        <div
          className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-white text-lg font-bold shadow-sm"
          style={{ backgroundColor: color }}
        >
          {name ? name[0].toUpperCase() : '?'}
        </div>

        <div className="flex-1 grid grid-cols-2 gap-3 min-w-0">
          {/* 스키마 이름 */}
          <div className="space-y-1.5">
            <Label htmlFor="schema-name" className="text-xs font-medium">
              스키마 이름 <span className="text-danger">*</span>
            </Label>
            <Input
              id="schema-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 거래처, 품목, 공정..."
              className="h-8 text-sm"
            />
          </div>

          {/* 설명 */}
          <div className="space-y-1.5">
            <Label htmlFor="schema-description" className="text-xs font-medium">
              설명
            </Label>
            <Input
              id="schema-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="스키마 설명 (선택)"
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* 색상 선택 */}
        <div className="flex-shrink-0">
          <Label className="text-xs font-medium block mb-1.5">색상</Label>
          <div className="flex gap-1 flex-wrap w-[116px]">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  borderColor: c === color ? 'white' : 'transparent',
                  outline: c === color ? `2px solid ${c}` : 'none',
                  outlineOffset: '1px',
                }}
                title={c}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
