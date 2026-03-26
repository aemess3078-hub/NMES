/**
 * 스키마 빌더 상태 관리 (Zustand)
 * 드래그앤드롭 필드 편집기의 로컬 UI 상태를 관리합니다.
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { generateId, toSnakeCase } from '@/lib/utils';
import type {
  FieldDefinition,
  FieldType,
  RelationDefinition,
  SchemaDefinition,
} from '@/types';

interface SchemaBuilderStore {
  // 현재 편집 중인 스키마
  schemaId: string | null;
  name: string;
  description: string;
  icon: string;
  color: string;
  fields: FieldDefinition[];
  relations: RelationDefinition[];

  // UI 상태
  selectedFieldId: string | null;
  isDirty: boolean;

  // 초기화
  initFromSchema: (schema: SchemaDefinition) => void;
  initEmpty: () => void;

  // 스키마 메타데이터
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setIcon: (icon: string) => void;
  setColor: (color: string) => void;

  // 필드 조작
  addField: (type: FieldType) => void;
  updateField: (fieldId: string, updates: Partial<FieldDefinition>) => void;
  removeField: (fieldId: string) => void;
  reorderFields: (fromIndex: number, toIndex: number) => void;
  selectField: (fieldId: string | null) => void;

  // 관계 조작
  addRelation: (relation: Omit<RelationDefinition, 'id'>) => void;
  removeRelation: (relationId: string) => void;

  // 상태 리셋
  markClean: () => void;
}

const DEFAULT_FIELD_NAMES: Record<FieldType, string> = {
  text: '텍스트 필드',
  number: '숫자 필드',
  date: '날짜 필드',
  datetime: '날짜시간 필드',
  boolean: '체크박스',
  select: '드롭다운',
  multiselect: '다중선택',
  relation: '관계 필드',
  file: '파일 첨부',
  textarea: '장문 텍스트',
};

export const useSchemaBuilderStore = create<SchemaBuilderStore>()(
  immer((set) => ({
    schemaId: null,
    name: '',
    description: '',
    icon: 'Table',
    color: '#6366f1',
    fields: [],
    relations: [],
    selectedFieldId: null,
    isDirty: false,

    initFromSchema: (schema) =>
      set((state) => {
        state.schemaId = schema.id;
        state.name = schema.name;
        state.description = schema.description ?? '';
        state.icon = schema.icon ?? 'Table';
        state.color = schema.color ?? '#6366f1';
        state.fields = [...schema.fields];
        state.relations = [...schema.relations];
        state.selectedFieldId = null;
        state.isDirty = false;
      }),

    initEmpty: () =>
      set((state) => {
        state.schemaId = null;
        state.name = '';
        state.description = '';
        state.icon = 'Table';
        state.color = '#6366f1';
        state.fields = [];
        state.relations = [];
        state.selectedFieldId = null;
        state.isDirty = false;
      }),

    setName: (name) =>
      set((state) => {
        state.name = name;
        state.isDirty = true;
      }),

    setDescription: (description) =>
      set((state) => {
        state.description = description;
        state.isDirty = true;
      }),

    setIcon: (icon) =>
      set((state) => {
        state.icon = icon;
        state.isDirty = true;
      }),

    setColor: (color) =>
      set((state) => {
        state.color = color;
        state.isDirty = true;
      }),

    addField: (type) =>
      set((state) => {
        const name = DEFAULT_FIELD_NAMES[type];
        const key = toSnakeCase(name) + '_' + state.fields.length;
        const newField: FieldDefinition = {
          id: generateId(),
          name,
          key,
          type,
          required: false,
          unique: false,
          displayOrder: state.fields.length,
          options: type === 'select' || type === 'multiselect' ? [] : undefined,
        };
        state.fields.push(newField);
        state.selectedFieldId = newField.id;
        state.isDirty = true;
      }),

    updateField: (fieldId, updates) =>
      set((state) => {
        const index = state.fields.findIndex((f) => f.id === fieldId);
        if (index === -1) return;
        Object.assign(state.fields[index], updates);
        state.isDirty = true;
      }),

    removeField: (fieldId) =>
      set((state) => {
        state.fields = state.fields.filter((f) => f.id !== fieldId);
        if (state.selectedFieldId === fieldId) {
          state.selectedFieldId = null;
        }
        // displayOrder 재정렬
        state.fields.forEach((f, i) => {
          f.displayOrder = i;
        });
        state.isDirty = true;
      }),

    reorderFields: (fromIndex, toIndex) =>
      set((state) => {
        const [moved] = state.fields.splice(fromIndex, 1);
        state.fields.splice(toIndex, 0, moved);
        state.fields.forEach((f, i) => {
          f.displayOrder = i;
        });
        state.isDirty = true;
      }),

    selectField: (fieldId) =>
      set((state) => {
        state.selectedFieldId = fieldId;
      }),

    addRelation: (relation) =>
      set((state) => {
        state.relations.push({ ...relation, id: generateId() });
        state.isDirty = true;
      }),

    removeRelation: (relationId) =>
      set((state) => {
        state.relations = state.relations.filter((r) => r.id !== relationId);
        state.isDirty = true;
      }),

    markClean: () =>
      set((state) => {
        state.isDirty = false;
      }),
  }))
);
