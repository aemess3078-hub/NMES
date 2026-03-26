/**
 * 기본 템플릿 스키마 시드 데이터
 * MES에서 일반적으로 사용되는 기준정보 템플릿을 제공합니다.
 * 사용자는 이를 수정/삭제하거나 새로운 스키마를 추가할 수 있습니다.
 */

import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const SYSTEM_USER_ID = 'system-seed-user';

const TEMPLATE_SCHEMAS = [
  {
    name: '거래처',
    description: '공급업체, 고객사 등 거래처 정보',
    icon: 'Building2',
    color: '#6366f1',
    fields: [
      { id: 'f1', name: '거래처코드', key: 'code', type: 'text', required: true, unique: true, displayOrder: 0 },
      { id: 'f2', name: '거래처명', key: 'name', type: 'text', required: true, unique: false, displayOrder: 1 },
      { id: 'f3', name: '사업자번호', key: 'business_number', type: 'text', required: false, unique: true, displayOrder: 2 },
      { id: 'f4', name: '거래처유형', key: 'type', type: 'select', required: true, unique: false, options: ['공급업체', '고객사', '내부'], displayOrder: 3 },
      { id: 'f5', name: '담당자', key: 'contact_person', type: 'text', required: false, unique: false, displayOrder: 4 },
      { id: 'f6', name: '연락처', key: 'phone', type: 'text', required: false, unique: false, displayOrder: 5 },
      { id: 'f7', name: '이메일', key: 'email', type: 'text', required: false, unique: false, displayOrder: 6 },
      { id: 'f8', name: '주소', key: 'address', type: 'text', required: false, unique: false, displayOrder: 7 },
      { id: 'f9', name: '사용여부', key: 'is_active', type: 'boolean', required: false, unique: false, defaultValue: true, displayOrder: 8 },
    ],
    relations: [],
    isTemplate: true,
  },
  {
    name: '품목',
    description: '원자재, 반제품, 완제품 등 품목 마스터',
    icon: 'Package',
    color: '#8b5cf6',
    fields: [
      { id: 'f1', name: '품목코드', key: 'code', type: 'text', required: true, unique: true, displayOrder: 0 },
      { id: 'f2', name: '품목명', key: 'name', type: 'text', required: true, unique: false, displayOrder: 1 },
      { id: 'f3', name: '품목유형', key: 'type', type: 'select', required: true, unique: false, options: ['원자재', '반제품', '완제품', '소모품'], displayOrder: 2 },
      { id: 'f4', name: '단위', key: 'unit', type: 'select', required: true, unique: false, options: ['EA', 'KG', 'M', 'L', 'BOX', 'SET'], displayOrder: 3 },
      { id: 'f5', name: '단가', key: 'unit_price', type: 'number', required: false, unique: false, displayOrder: 4 },
      { id: 'f6', name: '안전재고', key: 'safety_stock', type: 'number', required: false, unique: false, defaultValue: 0, displayOrder: 5 },
      { id: 'f7', name: '리드타임(일)', key: 'lead_time_days', type: 'number', required: false, unique: false, displayOrder: 6 },
      { id: 'f8', name: '사용여부', key: 'is_active', type: 'boolean', required: false, unique: false, defaultValue: true, displayOrder: 7 },
    ],
    relations: [],
    isTemplate: true,
  },
  {
    name: '공정',
    description: '생산 공정 마스터 (절단, 용접, 조립 등)',
    icon: 'GitBranch',
    color: '#10b981',
    fields: [
      { id: 'f1', name: '공정코드', key: 'code', type: 'text', required: true, unique: true, displayOrder: 0 },
      { id: 'f2', name: '공정명', key: 'name', type: 'text', required: true, unique: false, displayOrder: 1 },
      { id: 'f3', name: '공정유형', key: 'type', type: 'select', required: false, unique: false, options: ['기계가공', '조립', '검사', '포장', '외주'], displayOrder: 2 },
      { id: 'f4', name: '표준작업시간(분)', key: 'std_time_min', type: 'number', required: false, unique: false, displayOrder: 3 },
      { id: 'f5', name: '설명', key: 'description', type: 'text', required: false, unique: false, displayOrder: 4 },
    ],
    relations: [],
    isTemplate: true,
  },
  {
    name: '설비',
    description: '생산 설비 및 기계 마스터',
    icon: 'Cog',
    color: '#f59e0b',
    fields: [
      { id: 'f1', name: '설비코드', key: 'code', type: 'text', required: true, unique: true, displayOrder: 0 },
      { id: 'f2', name: '설비명', key: 'name', type: 'text', required: true, unique: false, displayOrder: 1 },
      { id: 'f3', name: '설비유형', key: 'type', type: 'select', required: false, unique: false, options: ['CNC', '프레스', '용접기', '검사장비', '조립라인'], displayOrder: 2 },
      { id: 'f4', name: '제조사', key: 'manufacturer', type: 'text', required: false, unique: false, displayOrder: 3 },
      { id: 'f5', name: '모델번호', key: 'model_number', type: 'text', required: false, unique: false, displayOrder: 4 },
      { id: 'f6', name: '설치일', key: 'install_date', type: 'date', required: false, unique: false, displayOrder: 5 },
      { id: 'f7', name: '가동여부', key: 'is_active', type: 'boolean', required: false, unique: false, defaultValue: true, displayOrder: 6 },
    ],
    relations: [],
    isTemplate: true,
  },
  {
    name: '공통코드',
    description: '시스템 전반에서 사용하는 공통 분류 코드',
    icon: 'List',
    color: '#ef4444',
    fields: [
      { id: 'f1', name: '그룹코드', key: 'group_code', type: 'text', required: true, unique: false, displayOrder: 0 },
      { id: 'f2', name: '그룹명', key: 'group_name', type: 'text', required: true, unique: false, displayOrder: 1 },
      { id: 'f3', name: '코드', key: 'code', type: 'text', required: true, unique: false, displayOrder: 2 },
      { id: 'f4', name: '코드명', key: 'code_name', type: 'text', required: true, unique: false, displayOrder: 3 },
      { id: 'f5', name: '정렬순서', key: 'sort_order', type: 'number', required: false, unique: false, defaultValue: 0, displayOrder: 4 },
      { id: 'f6', name: '사용여부', key: 'is_active', type: 'boolean', required: false, unique: false, defaultValue: true, displayOrder: 5 },
    ],
    relations: [],
    isTemplate: true,
  },
];

async function main() {
  console.log('Seeding template schemas...');

  // 시스템 프로필이 없으면 생성 (시드용)
  const systemProfile = await prisma.profile.upsert({
    where: { id: SYSTEM_USER_ID },
    create: {
      id: SYSTEM_USER_ID,
      email: 'system@mes.internal',
      name: 'System',
      role: UserRole.ADMIN,
    },
    update: {},
  });

  // 기본 메뉴 루트 폴더 생성
  const masterDataFolder = await prisma.menu.upsert({
    where: { id: 'menu-master-data' },
    create: {
      id: 'menu-master-data',
      name: '기준정보',
      icon: 'Database',
      menuType: 'FOLDER',
      displayOrder: 0,
      createdBy: systemProfile.id,
    },
    update: {},
  });

  // 템플릿 스키마 생성
  for (let i = 0; i < TEMPLATE_SCHEMAS.length; i++) {
    const template = TEMPLATE_SCHEMAS[i];
    const schema = await prisma.schema.upsert({
      where: { id: `template-schema-${i}` },
      create: {
        id: `template-schema-${i}`,
        ...template,
        displayOrder: i,
        createdBy: systemProfile.id,
      },
      update: {
        fields: template.fields,
        relations: template.relations,
      },
    });

    // 스키마에 대응하는 메뉴 아이템 생성
    await prisma.menu.upsert({
      where: { id: `menu-schema-${i}` },
      create: {
        id: `menu-schema-${i}`,
        parentId: masterDataFolder.id,
        name: template.name,
        icon: template.fields[0] ? 'Table' : 'File',
        menuType: 'SCHEMA',
        schemaId: schema.id,
        displayOrder: i,
        createdBy: systemProfile.id,
      },
      update: {},
    });

    console.log(`  Created template schema: ${template.name}`);
  }

  // 스키마 빌더 메뉴 추가
  await prisma.menu.upsert({
    where: { id: 'menu-schema-builder' },
    create: {
      id: 'menu-schema-builder',
      name: '스키마 빌더',
      icon: 'Wrench',
      menuType: 'SCREEN',
      displayOrder: 100,
      createdBy: systemProfile.id,
    },
    update: {},
  });

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
