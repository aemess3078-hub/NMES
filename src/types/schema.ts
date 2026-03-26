/**
 * 스키마 빌더 타입 정의
 * 메타데이터 기반 동적 스키마 시스템의 핵심 타입들
 */

// ============================================================
// 필드 타입 정의
// ============================================================

export const FIELD_TYPES = [
  'text',
  'number',
  'date',
  'datetime',
  'boolean',
  'select',
  'multiselect',
  'relation',
  'file',
  'textarea',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldValidation {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  patternMessage?: string;
}

export interface FieldDefinition {
  id: string;
  name: string;           // 표시용 이름 (e.g. "품목코드")
  key: string;            // 실제 데이터 키 (e.g. "item_code")
  type: FieldType;
  required: boolean;
  unique: boolean;
  defaultValue?: unknown;
  placeholder?: string;
  helpText?: string;
  options?: string[];          // select, multiselect 타입용
  relatedSchemaId?: string;    // relation 타입용
  relatedDisplayField?: string; // relation 타입에서 표시할 필드 key
  validation?: FieldValidation;
  displayOrder: number;
  isHidden?: boolean;          // 화면에서 숨김 처리
}

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: '텍스트',
  number: '숫자',
  date: '날짜',
  datetime: '날짜+시간',
  boolean: '체크박스',
  select: '드롭다운',
  multiselect: '다중선택',
  relation: '관계(참조)',
  file: '파일첨부',
  textarea: '장문텍스트',
};

export const FIELD_TYPE_ICONS: Record<FieldType, string> = {
  text: 'Type',
  number: 'Hash',
  date: 'Calendar',
  datetime: 'Clock',
  boolean: 'CheckSquare',
  select: 'ChevronDown',
  multiselect: 'ListChecks',
  relation: 'Link',
  file: 'Paperclip',
  textarea: 'AlignLeft',
};

// ============================================================
// 관계 정의
// ============================================================

export type RelationType = 'one-to-many' | 'many-to-one' | 'many-to-many';

export interface RelationDefinition {
  id: string;
  name: string;
  targetSchemaId: string;
  targetSchemaName?: string;  // UI 표시용 (DB 저장 불필요)
  type: RelationType;
  foreignKey: string;
}

// ============================================================
// 스키마 전체 정의
// ============================================================

export interface SchemaDefinition {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  fields: FieldDefinition[];
  relations: RelationDefinition[];
  isTemplate: boolean;
  isSystem: boolean;
  displayOrder: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// 스키마 레코드 (실제 데이터)
// ============================================================

export type RecordData = Record<string, unknown>;

export interface SchemaRecord {
  id: string;
  schemaId: string;
  data: RecordData;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

// ============================================================
// UI 상태 타입 (스키마 빌더)
// ============================================================

export interface SchemaBuilderState {
  schema: Partial<SchemaDefinition>;
  selectedFieldId: string | null;
  isDirty: boolean;
  errors: Record<string, string>;
}

// ============================================================
// API 요청/응답 타입
// ============================================================

export interface CreateSchemaRequest {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  fields: FieldDefinition[];
  relations: RelationDefinition[];
}

export interface UpdateSchemaRequest extends Partial<CreateSchemaRequest> {
  displayOrder?: number;
}

export interface CreateRecordRequest {
  data: RecordData;
}

export interface UpdateRecordRequest {
  data: Partial<RecordData>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
}
