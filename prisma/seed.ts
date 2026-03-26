import {
  PrismaClient,
  TenantStatus,
  UserRole,
  SiteType,
  PartnerType,
  PartnerStatus,
  ItemType,
  ItemStatus,
  UOM,
  WorkCenterKind,
  EquipmentType,
  EquipmentStatus,
  DefectCategory,
} from '@prisma/client';

const prisma = new PrismaClient();

// ─── IDs ─────────────────────────────────────────────────────────────────────

const IDS = {
  tenant: 'tenant-demo-001',

  profiles: {
    admin: 'profile-admin-001',
    manager: 'profile-manager-001',
    operator: 'profile-operator-001',
  },

  sites: {
    factory: 'site-factory-001',
    warehouse: 'site-warehouse-001',
  },

  workCenters: {
    machining: 'wc-machining-001',
    assembly: 'wc-assembly-001',
    inspection: 'wc-inspection-001',
    packaging: 'wc-packaging-001',
  },

  itemCategories: {
    raw: 'icat-raw-001',
    rawMetal: 'icat-raw-metal-001',
    rawChemical: 'icat-raw-chemical-001',
    semifinished: 'icat-semi-001',
    finished: 'icat-finished-001',
    consumable: 'icat-consumable-001',
  },

  warehouses: {
    rawMaterial: 'wh-raw-001',
    semifinished: 'wh-semi-001',
    finished: 'wh-fg-001',
  },

  locations: {
    rawA: 'loc-raw-A-001',
    rawB: 'loc-raw-B-001',
    rawC: 'loc-raw-C-001',
    semiA: 'loc-semi-A-001',
    semiB: 'loc-semi-B-001',
    fgA: 'loc-fg-A-001',
    fgB: 'loc-fg-B-001',
    fgShip: 'loc-fg-ship-001',
  },

  businessPartners: {
    supplier1: 'bp-supplier-001',
    supplier2: 'bp-supplier-002',
    customer1: 'bp-customer-001',
    customer2: 'bp-customer-002',
    both1: 'bp-both-001',
  },

  defectCodes: {
    dim01: 'dc-dim-001',
    dim02: 'dc-dim-002',
    vis01: 'dc-vis-001',
    vis02: 'dc-vis-002',
    func01: 'dc-func-001',
    func02: 'dc-func-002',
    mat01: 'dc-mat-001',
  },
} as const;

// ─── Seed Functions ───────────────────────────────────────────────────────────

async function seedTenant() {
  return prisma.tenant.upsert({
    where: { id: IDS.tenant },
    create: {
      id: IDS.tenant,
      code: 'DEMO',
      name: '데모 제조사',
      status: TenantStatus.ACTIVE,
    },
    update: { name: '데모 제조사', status: TenantStatus.ACTIVE },
  });
}

async function seedProfiles() {
  await prisma.profile.upsert({
    where: { id: IDS.profiles.admin },
    create: {
      id: IDS.profiles.admin,
      email: 'admin@demo-mes.internal',
      name: '관리자',
    },
    update: {},
  });

  await prisma.profile.upsert({
    where: { id: IDS.profiles.manager },
    create: {
      id: IDS.profiles.manager,
      email: 'manager@demo-mes.internal',
      name: '생산관리자',
    },
    update: {},
  });

  await prisma.profile.upsert({
    where: { id: IDS.profiles.operator },
    create: {
      id: IDS.profiles.operator,
      email: 'operator@demo-mes.internal',
      name: '현장작업자',
    },
    update: {},
  });
}

async function seedSites() {
  await prisma.site.upsert({
    where: { id: IDS.sites.factory },
    create: {
      id: IDS.sites.factory,
      tenantId: IDS.tenant,
      code: 'FAC-01',
      name: '본공장',
      type: SiteType.FACTORY,
    },
    update: {},
  });

  await prisma.site.upsert({
    where: { id: IDS.sites.warehouse },
    create: {
      id: IDS.sites.warehouse,
      tenantId: IDS.tenant,
      code: 'WH-SITE-01',
      name: '물류창고',
      type: SiteType.WAREHOUSE,
    },
    update: {},
  });
}

async function seedTenantUsers() {
  // 관리자: 전역 (siteId null)
  await prisma.tenantUser.upsert({
    where: { id: 'tu-admin-global' },
    create: {
      id: 'tu-admin-global',
      tenantId: IDS.tenant,
      profileId: IDS.profiles.admin,
      siteId: null,
      role: UserRole.ADMIN,
      isActive: true,
    },
    update: {},
  });

  // 생산관리자: 본공장
  await prisma.tenantUser.upsert({
    where: { id: 'tu-manager-factory' },
    create: {
      id: 'tu-manager-factory',
      tenantId: IDS.tenant,
      profileId: IDS.profiles.manager,
      siteId: IDS.sites.factory,
      role: UserRole.MANAGER,
      isActive: true,
    },
    update: {},
  });

  // 현장작업자: 본공장
  await prisma.tenantUser.upsert({
    where: { id: 'tu-operator-factory' },
    create: {
      id: 'tu-operator-factory',
      tenantId: IDS.tenant,
      profileId: IDS.profiles.operator,
      siteId: IDS.sites.factory,
      role: UserRole.OPERATOR,
      isActive: true,
    },
    update: {},
  });
}

async function seedWorkCenters() {
  const centers: Array<{
    id: string;
    code: string;
    name: string;
    kind: WorkCenterKind;
  }> = [
    { id: IDS.workCenters.machining,  code: 'WC-MACH', name: '기계가공',   kind: WorkCenterKind.MACHINING  },
    { id: IDS.workCenters.assembly,   code: 'WC-ASSY', name: '조립',       kind: WorkCenterKind.ASSEMBLY   },
    { id: IDS.workCenters.inspection, code: 'WC-INSP', name: '검사',       kind: WorkCenterKind.INSPECTION },
    { id: IDS.workCenters.packaging,  code: 'WC-PACK', name: '포장',       kind: WorkCenterKind.PACKAGING  },
  ];

  for (const wc of centers) {
    await prisma.workCenter.upsert({
      where: { id: wc.id },
      create: { ...wc, siteId: IDS.sites.factory },
      update: {},
    });
  }
}

async function seedEquipments() {
  const equipments: Array<{
    id: string;
    workCenterId: string;
    code: string;
    name: string;
    equipmentType: EquipmentType;
    status: EquipmentStatus;
  }> = [
    {
      id: 'eq-cnc-001',
      workCenterId: IDS.workCenters.machining,
      code: 'EQ-CNC-001',
      name: 'CNC 선반 #1',
      equipmentType: EquipmentType.MACHINE,
      status: EquipmentStatus.ACTIVE,
    },
    {
      id: 'eq-cnc-002',
      workCenterId: IDS.workCenters.machining,
      code: 'EQ-CNC-002',
      name: 'CNC 선반 #2',
      equipmentType: EquipmentType.MACHINE,
      status: EquipmentStatus.ACTIVE,
    },
    {
      id: 'eq-assy-001',
      workCenterId: IDS.workCenters.assembly,
      code: 'EQ-ASSY-001',
      name: '조립 지그 #1',
      equipmentType: EquipmentType.JIG,
      status: EquipmentStatus.ACTIVE,
    },
    {
      id: 'eq-insp-001',
      workCenterId: IDS.workCenters.inspection,
      code: 'EQ-CMM-001',
      name: '3D 측정기 (CMM)',
      equipmentType: EquipmentType.MACHINE,
      status: EquipmentStatus.ACTIVE,
    },
  ];

  for (const eq of equipments) {
    await prisma.equipment.upsert({
      where: { id: eq.id },
      create: {
        ...eq,
        tenantId: IDS.tenant,
        siteId: IDS.sites.factory,
      },
      update: {},
    });
  }
}

async function seedItemCategories() {
  // 최상위 카테고리
  const roots: Array<{
    id: string;
    code: string;
    name: string;
    displayOrder: number;
  }> = [
    { id: IDS.itemCategories.raw,         code: 'CAT-RAW',  name: '원자재',   displayOrder: 0 },
    { id: IDS.itemCategories.semifinished, code: 'CAT-SEMI', name: '반제품',   displayOrder: 1 },
    { id: IDS.itemCategories.finished,     code: 'CAT-FG',   name: '완제품',   displayOrder: 2 },
    { id: IDS.itemCategories.consumable,   code: 'CAT-CONS', name: '소모품',   displayOrder: 3 },
  ];

  for (const cat of roots) {
    await prisma.itemCategory.upsert({
      where: { id: cat.id },
      create: { ...cat, tenantId: IDS.tenant, parentId: null },
      update: {},
    });
  }

  // 원자재 하위
  const rawChildren: Array<{
    id: string;
    code: string;
    name: string;
    displayOrder: number;
  }> = [
    { id: IDS.itemCategories.rawMetal,    code: 'CAT-RAW-METAL', name: '금속 원자재',   displayOrder: 0 },
    { id: IDS.itemCategories.rawChemical, code: 'CAT-RAW-CHEM',  name: '화학 원자재',   displayOrder: 1 },
  ];

  for (const cat of rawChildren) {
    await prisma.itemCategory.upsert({
      where: { id: cat.id },
      create: { ...cat, tenantId: IDS.tenant, parentId: IDS.itemCategories.raw },
      update: {},
    });
  }
}

async function seedWarehouses() {
  const warehouses: Array<{
    id: string;
    code: string;
    name: string;
    siteId: string;
  }> = [
    { id: IDS.warehouses.rawMaterial, code: 'WH-RAW',  name: '원자재 창고',   siteId: IDS.sites.factory },
    { id: IDS.warehouses.semifinished, code: 'WH-SEMI', name: '반제품 창고',   siteId: IDS.sites.factory },
    { id: IDS.warehouses.finished,     code: 'WH-FG',   name: '완제품 창고',   siteId: IDS.sites.warehouse },
  ];

  for (const wh of warehouses) {
    await prisma.warehouse.upsert({
      where: { id: wh.id },
      create: { ...wh, tenantId: IDS.tenant },
      update: {},
    });
  }
}

async function seedLocations() {
  const locations: Array<{
    id: string;
    warehouseId: string;
    code: string;
    name: string;
    locationType: string;
  }> = [
    // 원자재 창고
    { id: IDS.locations.rawA,    warehouseId: IDS.warehouses.rawMaterial,  code: 'RAW-A-01', name: '원자재 A구역 1번',   locationType: 'RACK'  },
    { id: IDS.locations.rawB,    warehouseId: IDS.warehouses.rawMaterial,  code: 'RAW-A-02', name: '원자재 A구역 2번',   locationType: 'RACK'  },
    { id: IDS.locations.rawC,    warehouseId: IDS.warehouses.rawMaterial,  code: 'RAW-B-01', name: '원자재 B구역 1번',   locationType: 'FLOOR' },
    // 반제품 창고
    { id: IDS.locations.semiA,   warehouseId: IDS.warehouses.semifinished, code: 'SEMI-A-01', name: '반제품 A구역 1번',  locationType: 'RACK'  },
    { id: IDS.locations.semiB,   warehouseId: IDS.warehouses.semifinished, code: 'SEMI-A-02', name: '반제품 A구역 2번',  locationType: 'RACK'  },
    // 완제품 창고
    { id: IDS.locations.fgA,     warehouseId: IDS.warehouses.finished,     code: 'FG-A-01',  name: '완제품 A구역 1번',  locationType: 'RACK'  },
    { id: IDS.locations.fgB,     warehouseId: IDS.warehouses.finished,     code: 'FG-A-02',  name: '완제품 A구역 2번',  locationType: 'RACK'  },
    { id: IDS.locations.fgShip,  warehouseId: IDS.warehouses.finished,     code: 'FG-SHIP',  name: '출하 대기',         locationType: 'STAGING' },
  ];

  for (const loc of locations) {
    await prisma.location.upsert({
      where: { id: loc.id },
      create: loc,
      update: {},
    });
  }
}

async function seedBusinessPartners() {
  const partners: Array<{
    id: string;
    code: string;
    name: string;
    partnerType: PartnerType;
    status: PartnerStatus;
  }> = [
    { id: IDS.businessPartners.supplier1, code: 'BP-SUP-001', name: '(주)한국소재',      partnerType: PartnerType.SUPPLIER, status: PartnerStatus.ACTIVE },
    { id: IDS.businessPartners.supplier2, code: 'BP-SUP-002', name: '대성부품(주)',       partnerType: PartnerType.SUPPLIER, status: PartnerStatus.ACTIVE },
    { id: IDS.businessPartners.customer1, code: 'BP-CUS-001', name: '(주)미래전자',      partnerType: PartnerType.CUSTOMER, status: PartnerStatus.ACTIVE },
    { id: IDS.businessPartners.customer2, code: 'BP-CUS-002', name: '글로벌테크 코리아', partnerType: PartnerType.CUSTOMER, status: PartnerStatus.ACTIVE },
    { id: IDS.businessPartners.both1,     code: 'BP-BTH-001', name: '동방산업(주)',       partnerType: PartnerType.BOTH,     status: PartnerStatus.ACTIVE },
  ];

  for (const bp of partners) {
    await prisma.businessPartner.upsert({
      where: { id: bp.id },
      create: { ...bp, tenantId: IDS.tenant },
      update: {},
    });
  }
}

async function seedDefectCodes() {
  const codes: Array<{
    id: string;
    code: string;
    name: string;
    defectCategory: DefectCategory;
  }> = [
    // 치수
    { id: IDS.defectCodes.dim01, code: 'DIM-001', name: '치수 초과',       defectCategory: DefectCategory.DIMENSIONAL },
    { id: IDS.defectCodes.dim02, code: 'DIM-002', name: '치수 미달',       defectCategory: DefectCategory.DIMENSIONAL },
    // 외관
    { id: IDS.defectCodes.vis01, code: 'VIS-001', name: '표면 스크래치',   defectCategory: DefectCategory.VISUAL      },
    { id: IDS.defectCodes.vis02, code: 'VIS-002', name: '도장 불량',       defectCategory: DefectCategory.VISUAL      },
    // 기능
    { id: IDS.defectCodes.func01, code: 'FUN-001', name: '작동 불량',      defectCategory: DefectCategory.FUNCTIONAL  },
    { id: IDS.defectCodes.func02, code: 'FUN-002', name: '강도 미달',      defectCategory: DefectCategory.FUNCTIONAL  },
    // 재질
    { id: IDS.defectCodes.mat01, code: 'MAT-001', name: '재질 부적합',     defectCategory: DefectCategory.MATERIAL    },
  ];

  for (const dc of codes) {
    await prisma.defectCode.upsert({
      where: { id: dc.id },
      create: { ...dc, tenantId: IDS.tenant },
      update: {},
    });
  }
}

async function seedItems() {
  const items: Array<{
    id: string;
    code: string;
    name: string;
    itemType: ItemType;
    uom: UOM;
    categoryId: string;
    isLotTracked: boolean;
    spec?: string;
    status: ItemStatus;
  }> = [
    // 원자재
    {
      id: 'item-raw-steel-001',
      code: 'RM-STEEL-001',
      name: 'SUS304 스테인리스 판재',
      itemType: ItemType.RAW_MATERIAL,
      uom: UOM.KG,
      categoryId: IDS.itemCategories.rawMetal,
      isLotTracked: true,
      spec: 'SUS304 t=2.0mm',
      status: ItemStatus.ACTIVE,
    },
    {
      id: 'item-raw-alum-001',
      code: 'RM-ALUM-001',
      name: '알루미늄 6061 봉재',
      itemType: ItemType.RAW_MATERIAL,
      uom: UOM.KG,
      categoryId: IDS.itemCategories.rawMetal,
      isLotTracked: true,
      spec: 'Al6061-T6 Φ50',
      status: ItemStatus.ACTIVE,
    },
    {
      id: 'item-raw-bolt-001',
      code: 'RM-BOLT-001',
      name: 'M8×25 육각볼트',
      itemType: ItemType.RAW_MATERIAL,
      uom: UOM.EA,
      categoryId: IDS.itemCategories.rawMetal,
      isLotTracked: false,
      spec: 'M8×25 SUS304',
      status: ItemStatus.ACTIVE,
    },
    // 반제품
    {
      id: 'item-semi-frame-001',
      code: 'SF-FRAME-001',
      name: '하우징 프레임 (기계가공)',
      itemType: ItemType.SEMI_FINISHED,
      uom: UOM.EA,
      categoryId: IDS.itemCategories.semifinished,
      isLotTracked: true,
      spec: '도면 DWG-FRAME-001 Rev.B',
      status: ItemStatus.ACTIVE,
    },
    {
      id: 'item-semi-shaft-001',
      code: 'SF-SHAFT-001',
      name: '구동 샤프트 (기계가공)',
      itemType: ItemType.SEMI_FINISHED,
      uom: UOM.EA,
      categoryId: IDS.itemCategories.semifinished,
      isLotTracked: true,
      spec: '도면 DWG-SHAFT-001 Rev.A',
      status: ItemStatus.ACTIVE,
    },
    // 완제품
    {
      id: 'item-fg-assy-001',
      code: 'FG-ASSY-001',
      name: '구동 모듈 완제품 A형',
      itemType: ItemType.FINISHED,
      uom: UOM.EA,
      categoryId: IDS.itemCategories.finished,
      isLotTracked: true,
      spec: '제품사양서 SPEC-ASSY-001 Rev.C',
      status: ItemStatus.ACTIVE,
    },
    // 소모품
    {
      id: 'item-cons-oil-001',
      code: 'CS-OIL-001',
      name: '절삭유',
      itemType: ItemType.CONSUMABLE,
      uom: UOM.L,
      categoryId: IDS.itemCategories.consumable,
      isLotTracked: false,
      status: ItemStatus.ACTIVE,
    },
    {
      id: 'item-cons-glove-001',
      code: 'CS-GLOVE-001',
      name: '작업용 안전장갑',
      itemType: ItemType.CONSUMABLE,
      uom: UOM.EA,
      categoryId: IDS.itemCategories.consumable,
      isLotTracked: false,
      status: ItemStatus.ACTIVE,
    },
  ];

  for (const item of items) {
    await prisma.item.upsert({
      where: { id: item.id },
      create: { ...item, tenantId: IDS.tenant },
      update: {},
    });
  }
}

async function seedLotRules() {
  // LOT 추적 품목에만 LOT 규칙 설정
  const lotTrackedItems = [
    'item-raw-steel-001',
    'item-raw-alum-001',
    'item-semi-frame-001',
    'item-semi-shaft-001',
    'item-fg-assy-001',
  ];

  const rules: Array<{
    id: string;
    itemId: string;
    prefix: string;
    dateFormat: string;
    seqLength: number;
  }> = [
    { id: 'lr-steel-001',  itemId: 'item-raw-steel-001',    prefix: 'ST', dateFormat: 'YYMMDD', seqLength: 4 },
    { id: 'lr-alum-001',   itemId: 'item-raw-alum-001',     prefix: 'AL', dateFormat: 'YYMMDD', seqLength: 4 },
    { id: 'lr-frame-001',  itemId: 'item-semi-frame-001',   prefix: 'FR', dateFormat: 'YYMMDD', seqLength: 4 },
    { id: 'lr-shaft-001',  itemId: 'item-semi-shaft-001',   prefix: 'SH', dateFormat: 'YYMMDD', seqLength: 4 },
    { id: 'lr-assy-001',   itemId: 'item-fg-assy-001',      prefix: 'FG', dateFormat: 'YYMMDD', seqLength: 5 },
  ];

  for (const rule of rules) {
    if (!lotTrackedItems.includes(rule.itemId)) continue;
    await prisma.lotRule.upsert({
      where: { id: rule.id },
      create: { ...rule, tenantId: IDS.tenant },
      update: {},
    });
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('▶ MES 기준정보 시드 시작...\n');

  console.log('  [1/11] Tenant');
  await seedTenant();

  console.log('  [2/11] Profiles');
  await seedProfiles();

  console.log('  [3/11] Sites');
  await seedSites();

  console.log('  [4/11] TenantUsers');
  await seedTenantUsers();

  console.log('  [5/11] WorkCenters');
  await seedWorkCenters();

  console.log('  [6/11] Equipments');
  await seedEquipments();

  console.log('  [7/11] ItemCategories');
  await seedItemCategories();

  console.log('  [8/11] Warehouses + Locations');
  await seedWarehouses();
  await seedLocations();

  console.log('  [9/11] BusinessPartners');
  await seedBusinessPartners();

  console.log('  [10/11] DefectCodes');
  await seedDefectCodes();

  console.log('  [11/11] Items + LotRules');
  await seedItems();
  await seedLotRules();

  console.log('\n✔ 시드 완료');
  console.log('  - Tenant: 1');
  console.log('  - Profile: 3 (admin / manager / operator)');
  console.log('  - Site: 2 (본공장 / 물류창고)');
  console.log('  - TenantUser: 3');
  console.log('  - WorkCenter: 4');
  console.log('  - Equipment: 4');
  console.log('  - ItemCategory: 6 (4 루트 + 2 원자재 하위)');
  console.log('  - Warehouse: 3 / Location: 8');
  console.log('  - BusinessPartner: 5');
  console.log('  - DefectCode: 7');
  console.log('  - Item: 8 / LotRule: 5');
}

main()
  .catch((e) => {
    console.error('시드 실패:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
