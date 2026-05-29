import bcrypt from 'bcryptjs';
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
  BOMStatus,
  RoutingStatus,
  WorkOrderStatus,
  OperationStatus,
  PlanType,
  PlanStatus,
  PermissionAction,
  ConnectionProtocol,
  TagDataType,
  TagCategory,
  SalesOrderStatus,
  ShipmentStatus,
  PurchaseOrderStatus,
  InspectionSpecStatus,
  InspectionInputType,
  LotStatus,
  TransactionType,
  WipUnitStatus,
  WipMovementType,
  InspectionStage,
  InspectionResult,
  DefectSeverity,
  DefectDisposition,
} from '@prisma/client';

const prisma = new PrismaClient();

type SeedMode = 'base' | 'customer' | 'demo'

const requestedSeedMode = process.env.SEED_MODE?.trim().toLowerCase()
const SEED_MODE: SeedMode =
  requestedSeedMode === 'base' ||
  requestedSeedMode === 'customer' ||
  requestedSeedMode === 'demo'
    ? requestedSeedMode
    : 'base'

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
    postProcess: 'wc-post-process-001',
    finishedStore: 'wc-finished-store-001',
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

  quotations: {
    qt1: 'qt-2026-001',
    qt2: 'qt-2026-002',
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
    { id: IDS.workCenters.machining,     code: 'WC-MACH',  name: '가공공정',     kind: WorkCenterKind.MACHINING  },
    { id: IDS.workCenters.assembly,      code: 'WC-ASSY',  name: '조립',         kind: WorkCenterKind.ASSEMBLY   },
    { id: IDS.workCenters.inspection,    code: 'WC-INSP',  name: '검사공정',     kind: WorkCenterKind.INSPECTION },
    { id: IDS.workCenters.packaging,     code: 'WC-PACK',  name: '포장공정',     kind: WorkCenterKind.PACKAGING  },
    { id: IDS.workCenters.postProcess,   code: 'WC-POST',  name: '후처리공정',   kind: WorkCenterKind.ASSEMBLY   },
    { id: IDS.workCenters.finishedStore, code: 'WC-STORE', name: '완제품입고',   kind: WorkCenterKind.STORAGE    },
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
    itemType: ItemType;
  }> = [
    { id: IDS.itemCategories.raw,         code: 'CAT-RAW',  name: '원자재',   displayOrder: 0, itemType: ItemType.RAW_MATERIAL },
    { id: IDS.itemCategories.semifinished, code: 'CAT-SEMI', name: '반제품',   displayOrder: 1, itemType: ItemType.SEMI_FINISHED },
    { id: IDS.itemCategories.finished,     code: 'CAT-FG',   name: '완제품',   displayOrder: 2, itemType: ItemType.FINISHED },
    { id: IDS.itemCategories.consumable,   code: 'CAT-CONS', name: '소모품',   displayOrder: 3, itemType: ItemType.CONSUMABLE },
  ];

  for (const cat of roots) {
    await prisma.itemCategory.upsert({
      where: { id: cat.id },
      create: { ...cat, tenantId: IDS.tenant, parentId: null },
      update: { itemType: cat.itemType },
    });
  }

  // 원자재 하위
  const rawChildren: Array<{
    id: string;
    code: string;
    name: string;
    displayOrder: number;
    itemType: ItemType;
  }> = [
    { id: IDS.itemCategories.rawMetal,    code: 'CAT-RAW-METAL', name: '금속 원자재',   displayOrder: 0, itemType: ItemType.RAW_MATERIAL },
    { id: IDS.itemCategories.rawChemical, code: 'CAT-RAW-CHEM',  name: '화학 원자재',   displayOrder: 1, itemType: ItemType.RAW_MATERIAL },
  ];

  for (const cat of rawChildren) {
    await prisma.itemCategory.upsert({
      where: { id: cat.id },
      create: { ...cat, tenantId: IDS.tenant, parentId: IDS.itemCategories.raw },
      update: { itemType: cat.itemType },
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

async function seedNumberingRules() {
  // 테넌트 단위 LOT 번호 규칙: LOT-YYYYMMDD-0001 형식
  await prisma.numberingRule.upsert({
    where: { tenantId_type: { tenantId: IDS.tenant, type: 'LOT' } },
    create: {
      id: 'nr-lot-001',
      tenantId: IDS.tenant,
      type: 'LOT',
      tokens: [
        { id: 'tok-1', type: 'FIXED', value: 'LOT' },
        { id: 'tok-2', type: 'SEPARATOR', value: '-' },
        { id: 'tok-3', type: 'DATE', format: 'YYYY' },
        { id: 'tok-4', type: 'DATE', format: 'MM' },
        { id: 'tok-5', type: 'DATE', format: 'DD' },
        { id: 'tok-6', type: 'SEPARATOR', value: '-' },
        { id: 'tok-7', type: 'SEQ', digits: 4 },
      ],
      isActive: true,
    },
    update: {},
  });

  // 테넌트 단위 시리얼 번호 규칙: SN-YYYYMMDD-0001 형식
  await prisma.numberingRule.upsert({
    where: { tenantId_type: { tenantId: IDS.tenant, type: 'SERIAL' } },
    create: {
      id: 'nr-serial-001',
      tenantId: IDS.tenant,
      type: 'SERIAL',
      tokens: [
        { id: 'tok-s1', type: 'FIXED', value: 'SN' },
        { id: 'tok-s2', type: 'SEPARATOR', value: '-' },
        { id: 'tok-s3', type: 'DATE', format: 'YYYY' },
        { id: 'tok-s4', type: 'DATE', format: 'MM' },
        { id: 'tok-s5', type: 'DATE', format: 'DD' },
        { id: 'tok-s6', type: 'SEPARATOR', value: '-' },
        { id: 'tok-s7', type: 'SEQ', digits: 4 },
      ],
      isActive: true,
    },
    update: {},
  });
}

async function seedBoms() {
  // BOM: 구동 모듈 완제품 A형
  await prisma.bOM.upsert({
    where: { tenantId_itemId_version: { tenantId: IDS.tenant, itemId: 'item-fg-assy-001', version: '1.0' } },
    create: {
      id: 'bom-fg-assy-001',
      tenantId: IDS.tenant,
      itemId: 'item-fg-assy-001',
      version: '1.0',
      isDefault: true,
      status: BOMStatus.ACTIVE,
    },
    update: {},
  });

  await prisma.bOMItem.upsert({
    where: { bomId_seq: { bomId: 'bom-fg-assy-001', seq: 1 } },
    create: {
      bomId: 'bom-fg-assy-001',
      componentItemId: 'item-semi-frame-001',
      seq: 1,
      qtyPer: 1.0,
      scrapRate: 0.02,
    },
    update: {},
  });

  await prisma.bOMItem.upsert({
    where: { bomId_seq: { bomId: 'bom-fg-assy-001', seq: 2 } },
    create: {
      bomId: 'bom-fg-assy-001',
      componentItemId: 'item-semi-shaft-001',
      seq: 2,
      qtyPer: 1.0,
      scrapRate: 0.01,
    },
    update: {},
  });

  await prisma.bOMItem.upsert({
    where: { bomId_seq: { bomId: 'bom-fg-assy-001', seq: 3 } },
    create: {
      bomId: 'bom-fg-assy-001',
      componentItemId: 'item-raw-bolt-001',
      seq: 3,
      qtyPer: 4.0,
      scrapRate: 0.00,
    },
    update: {},
  });

  // BOM: 하우징 프레임 (기계가공)
  await prisma.bOM.upsert({
    where: { tenantId_itemId_version: { tenantId: IDS.tenant, itemId: 'item-semi-frame-001', version: '1.0' } },
    create: {
      id: 'bom-semi-frame-001',
      tenantId: IDS.tenant,
      itemId: 'item-semi-frame-001',
      version: '1.0',
      isDefault: true,
      status: BOMStatus.ACTIVE,
    },
    update: {},
  });

  await prisma.bOMItem.upsert({
    where: { bomId_seq: { bomId: 'bom-semi-frame-001', seq: 1 } },
    create: {
      bomId: 'bom-semi-frame-001',
      componentItemId: 'item-raw-steel-001',
      seq: 1,
      qtyPer: 2.5,
      scrapRate: 0.03,
    },
    update: {},
  });

  await prisma.bOMItem.upsert({
    where: { bomId_seq: { bomId: 'bom-semi-frame-001', seq: 2 } },
    create: {
      bomId: 'bom-semi-frame-001',
      componentItemId: 'item-raw-alum-001',
      seq: 2,
      qtyPer: 0.5,
      scrapRate: 0.02,
    },
    update: {},
  });
}

async function seedRoutings() {
  // Routing: 구동 모듈 완제품 A형
  await prisma.routing.upsert({
    where: { tenantId_code: { tenantId: IDS.tenant, code: 'RTG-FG-ASSY-001' } },
    create: {
      id: 'rtg-fg-assy-001',
      tenantId: IDS.tenant,
      code: 'RTG-FG-ASSY-001',
      name: '구동 모듈 완제품 A형 라우팅',
      version: '1.0',
      status: RoutingStatus.ACTIVE,
    },
    update: {},
  });

  // ItemRouting: 완제품 A형 - 라우팅 연결
  await prisma.itemRouting.upsert({
    where: { itemId_routingId: { itemId: 'item-fg-assy-001', routingId: 'rtg-fg-assy-001' } },
    create: {
      id: 'ir-fg-assy-001',
      tenantId: IDS.tenant,
      itemId: 'item-fg-assy-001',
      routingId: 'rtg-fg-assy-001',
      isDefault: true,
    },
    update: {},
  });

  await prisma.routingOperation.upsert({
    where: { routingId_seq: { routingId: 'rtg-fg-assy-001', seq: 10 } },
    create: {
      id: 'rop-assy-10',
      routingId: 'rtg-fg-assy-001',
      seq: 10,
      operationCode: 'OP-MCH',
      name: '기계가공',
      workCenterId: IDS.workCenters.machining,
      standardTime: 30.0,
    },
    update: {},
  });

  await prisma.routingOperation.upsert({
    where: { routingId_seq: { routingId: 'rtg-fg-assy-001', seq: 20 } },
    create: {
      id: 'rop-assy-20',
      routingId: 'rtg-fg-assy-001',
      seq: 20,
      operationCode: 'OP-ASM',
      name: '조립',
      workCenterId: IDS.workCenters.assembly,
      standardTime: 45.0,
    },
    update: {},
  });

  await prisma.routingOperation.upsert({
    where: { routingId_seq: { routingId: 'rtg-fg-assy-001', seq: 30 } },
    create: {
      id: 'rop-assy-30',
      routingId: 'rtg-fg-assy-001',
      seq: 30,
      operationCode: 'OP-INS',
      name: '검사',
      workCenterId: IDS.workCenters.inspection,
      standardTime: 15.0,
    },
    update: {},
  });

  await prisma.routingOperation.upsert({
    where: { routingId_seq: { routingId: 'rtg-fg-assy-001', seq: 40 } },
    create: {
      id: 'rop-assy-40',
      routingId: 'rtg-fg-assy-001',
      seq: 40,
      operationCode: 'OP-PKG',
      name: '포장',
      workCenterId: IDS.workCenters.packaging,
      standardTime: 10.0,
    },
    update: {},
  });

  // Routing: 하우징 프레임 (기계가공)
  await prisma.routing.upsert({
    where: { tenantId_code: { tenantId: IDS.tenant, code: 'RTG-SEMI-FRAME-001' } },
    create: {
      id: 'rtg-semi-frame-001',
      tenantId: IDS.tenant,
      code: 'RTG-SEMI-FRAME-001',
      name: '하우징 프레임 기계가공 라우팅',
      version: '1.0',
      status: RoutingStatus.ACTIVE,
    },
    update: {},
  });

  // ItemRouting: 하우징 프레임 - 라우팅 연결
  await prisma.itemRouting.upsert({
    where: { itemId_routingId: { itemId: 'item-semi-frame-001', routingId: 'rtg-semi-frame-001' } },
    create: {
      id: 'ir-semi-frame-001',
      tenantId: IDS.tenant,
      itemId: 'item-semi-frame-001',
      routingId: 'rtg-semi-frame-001',
      isDefault: true,
    },
    update: {},
  });

  await prisma.routingOperation.upsert({
    where: { routingId_seq: { routingId: 'rtg-semi-frame-001', seq: 10 } },
    create: {
      id: 'rop-frame-10',
      routingId: 'rtg-semi-frame-001',
      seq: 10,
      operationCode: 'OP-MCH',
      name: '기계가공',
      workCenterId: IDS.workCenters.machining,
      standardTime: 60.0,
    },
    update: {},
  });

  await prisma.routingOperation.upsert({
    where: { routingId_seq: { routingId: 'rtg-semi-frame-001', seq: 20 } },
    create: {
      id: 'rop-frame-20',
      routingId: 'rtg-semi-frame-001',
      seq: 20,
      operationCode: 'OP-INS',
      name: '검사',
      workCenterId: IDS.workCenters.inspection,
      standardTime: 20.0,
    },
    update: {},
  });

  await prisma.routingOperation.upsert({
    where: { routingId_seq: { routingId: 'rtg-semi-frame-001', seq: 30 } },
    create: {
      id: 'rop-frame-30',
      routingId: 'rtg-semi-frame-001',
      seq: 30,
      operationCode: 'OP-ASM',
      name: '조립',
      workCenterId: IDS.workCenters.assembly,
      standardTime: 30.0,
    },
    update: {},
  });

  // ── 의료기기 표준 라우팅: 가공 → 후처리 → 검사 → 포장 → 완제품입고 ──────────
  // 후처리공정은 세분화하지 않고 하나로 통일
  await prisma.routing.upsert({
    where: { tenantId_code: { tenantId: IDS.tenant, code: 'RTG-MEDICAL-STD' } },
    create: {
      id: 'rtg-medical-std-001',
      tenantId: IDS.tenant,
      code: 'RTG-MEDICAL-STD',
      name: '의료기기 표준 라우팅',
      version: '1.0',
      status: RoutingStatus.ACTIVE,
    },
    update: {},
  });

  await prisma.itemRouting.upsert({
    where: { itemId_routingId: { itemId: 'item-fg-assy-001', routingId: 'rtg-medical-std-001' } },
    create: {
      tenantId: IDS.tenant,
      itemId: 'item-fg-assy-001',
      routingId: 'rtg-medical-std-001',
      isDefault: false,
    },
    update: {},
  });

  const medicalOps: Array<{
    id: string;
    seq: number;
    code: string;
    name: string;
    workCenterId: string;
    standardTime: number;
  }> = [
    { id: 'rop-med-10', seq: 10, code: 'OP-MED-MCH',  name: '가공공정',     workCenterId: IDS.workCenters.machining,     standardTime: 30.0 },
    { id: 'rop-med-20', seq: 20, code: 'OP-MED-POST', name: '후처리공정',   workCenterId: IDS.workCenters.postProcess,   standardTime: 40.0 },
    { id: 'rop-med-30', seq: 30, code: 'OP-MED-INS',  name: '검사공정',     workCenterId: IDS.workCenters.inspection,    standardTime: 15.0 },
    { id: 'rop-med-40', seq: 40, code: 'OP-MED-PKG',  name: '포장공정',     workCenterId: IDS.workCenters.packaging,     standardTime: 10.0 },
    { id: 'rop-med-50', seq: 50, code: 'OP-MED-STR',  name: '완제품입고',   workCenterId: IDS.workCenters.finishedStore, standardTime: 5.0  },
  ];

  for (const op of medicalOps) {
    await prisma.routingOperation.upsert({
      where: { routingId_seq: { routingId: 'rtg-medical-std-001', seq: op.seq } },
      create: {
        id: op.id,
        routingId: 'rtg-medical-std-001',
        seq: op.seq,
        operationCode: op.code,
        name: op.name,
        workCenterId: op.workCenterId,
        standardTime: op.standardTime,
      },
      update: {},
    });
  }
}

async function seedInspectionSpecs() {
  await prisma.inspectionSpec.upsert({
    where: {
      tenantId_itemId_routingOperationId_version: {
        tenantId: IDS.tenant,
        itemId: 'item-fg-assy-001',
        routingOperationId: 'rop-med-30',
        version: '1.0',
      },
    },
    create: {
      id: 'ispec-med-fg-ins-001',
      tenantId: IDS.tenant,
      itemId: 'item-fg-assy-001',
      routingOperationId: 'rop-med-30',
      version: '1.0',
      status: InspectionSpecStatus.ACTIVE,
    },
    update: {
      status: InspectionSpecStatus.ACTIVE,
    },
  });

  const inspectionItems = [
    { id: 'iitem-med-fg-10', seq: 10, name: '외관 상태', inputType: InspectionInputType.TEXT, lowerLimit: null, upperLimit: null },
    { id: 'iitem-med-fg-20', seq: 20, name: '주요 치수', inputType: InspectionInputType.NUMERIC, lowerLimit: 0, upperLimit: 100 },
    { id: 'iitem-med-fg-30', seq: 30, name: '라벨 확인', inputType: InspectionInputType.BOOLEAN, lowerLimit: null, upperLimit: null },
  ];

  for (const item of inspectionItems) {
    await prisma.inspectionItem.upsert({
      where: {
        inspectionSpecId_seq: {
          inspectionSpecId: 'ispec-med-fg-ins-001',
          seq: item.seq,
        },
      },
      create: {
        id: item.id,
        inspectionSpecId: 'ispec-med-fg-ins-001',
        seq: item.seq,
        name: item.name,
        inputType: item.inputType,
        lowerLimit: item.lowerLimit,
        upperLimit: item.upperLimit,
      },
      update: {
        name: item.name,
        inputType: item.inputType,
        lowerLimit: item.lowerLimit,
        upperLimit: item.upperLimit,
      },
    });
  }
}

async function seedWorkOrders() {
  // 의료기기 표준 검증 샘플: 가공공정 → 후처리공정 → 검사공정 → 포장공정 → 완제품입고
  await prisma.workOrder.upsert({
    where: { tenantId_orderNo: { tenantId: IDS.tenant, orderNo: 'WO-MED-STD-001' } },
    create: {
      id: 'wo-med-std-001',
      tenantId: IDS.tenant,
      siteId: IDS.sites.factory,
      itemId: 'item-fg-assy-001',
      bomId: 'bom-fg-assy-001',
      routingId: 'rtg-medical-std-001',
      orderNo: 'WO-MED-STD-001',
      manufacturingNo: 'MFG-MED-STD-001',
      plannedQty: 10,
      status: WorkOrderStatus.RELEASED,
      dueDate: new Date('2026-05-31'),
    },
    update: {},
  });

  const medicalWorkOrderOps = [
    { id: 'woo-med-std-10', seq: 10, routingOperationId: 'rop-med-10', equipmentId: 'eq-cnc-001' },
    { id: 'woo-med-std-20', seq: 20, routingOperationId: 'rop-med-20', equipmentId: null },
    { id: 'woo-med-std-30', seq: 30, routingOperationId: 'rop-med-30', equipmentId: 'eq-insp-001' },
    { id: 'woo-med-std-40', seq: 40, routingOperationId: 'rop-med-40', equipmentId: null },
    { id: 'woo-med-std-50', seq: 50, routingOperationId: 'rop-med-50', equipmentId: null },
  ];

  for (const op of medicalWorkOrderOps) {
    await prisma.workOrderOperation.upsert({
      where: { workOrderId_seq: { workOrderId: 'wo-med-std-001', seq: op.seq } },
      create: {
        id: op.id,
        workOrderId: 'wo-med-std-001',
        routingOperationId: op.routingOperationId,
        seq: op.seq,
        status: OperationStatus.PENDING,
        plannedQty: 10,
        completedQty: 0,
        equipmentId: op.equipmentId,
      },
      update: {},
    });
  }

  // WorkOrder 1: RELEASED
  await prisma.workOrder.upsert({
    where: { tenantId_orderNo: { tenantId: IDS.tenant, orderNo: 'WO-2026-001' } },
    create: {
      id: 'wo-2026-001',
      tenantId: IDS.tenant,
      siteId: IDS.sites.factory,
      itemId: 'item-fg-assy-001',
      bomId: 'bom-fg-assy-001',
      routingId: 'rtg-fg-assy-001',
      orderNo: 'WO-2026-001',
      plannedQty: 100,
      status: WorkOrderStatus.RELEASED,
      dueDate: new Date('2026-04-15'),
    },
    update: {},
  });

  await prisma.workOrderOperation.upsert({
    where: { workOrderId_seq: { workOrderId: 'wo-2026-001', seq: 10 } },
    create: {
      id: 'woo-2026-001-10',
      workOrderId: 'wo-2026-001',
      routingOperationId: 'rop-assy-10',
      seq: 10,
      status: OperationStatus.IN_PROGRESS,
      plannedQty: 100,
      completedQty: 0,
      equipmentId: 'eq-cnc-001',
    },
    update: {},
  });

  await prisma.workOrderOperation.upsert({
    where: { workOrderId_seq: { workOrderId: 'wo-2026-001', seq: 20 } },
    create: {
      id: 'woo-2026-001-20',
      workOrderId: 'wo-2026-001',
      routingOperationId: 'rop-assy-20',
      seq: 20,
      status: OperationStatus.PENDING,
      plannedQty: 100,
      completedQty: 0,
      equipmentId: 'eq-assy-001',
    },
    update: {},
  });

  await prisma.workOrderOperation.upsert({
    where: { workOrderId_seq: { workOrderId: 'wo-2026-001', seq: 30 } },
    create: {
      id: 'woo-2026-001-30',
      workOrderId: 'wo-2026-001',
      routingOperationId: 'rop-assy-30',
      seq: 30,
      status: OperationStatus.PENDING,
      plannedQty: 100,
      completedQty: 0,
      equipmentId: 'eq-insp-001',
    },
    update: {},
  });

  await prisma.workOrderOperation.upsert({
    where: { workOrderId_seq: { workOrderId: 'wo-2026-001', seq: 40 } },
    create: {
      id: 'woo-2026-001-40',
      workOrderId: 'wo-2026-001',
      routingOperationId: 'rop-assy-40',
      seq: 40,
      status: OperationStatus.PENDING,
      plannedQty: 100,
      completedQty: 0,
      equipmentId: null,
    },
    update: {},
  });

  // WorkOrder 2: DRAFT (no operations)
  await prisma.workOrder.upsert({
    where: { tenantId_orderNo: { tenantId: IDS.tenant, orderNo: 'WO-2026-002' } },
    create: {
      id: 'wo-2026-002',
      tenantId: IDS.tenant,
      siteId: IDS.sites.factory,
      itemId: 'item-semi-frame-001',
      bomId: 'bom-semi-frame-001',
      routingId: 'rtg-semi-frame-001',
      orderNo: 'WO-2026-002',
      plannedQty: 50,
      status: WorkOrderStatus.DRAFT,
      dueDate: new Date('2026-04-20'),
    },
    update: {},
  });
}

async function seedProductionResults() {
  // WO-2026-001 첫 번째 공정(seq=10, id=woo-2026-001-10)에 실적 3건
  const results = [
    {
      id: 'pr-2026-001-1',
      workOrderOperationId: 'woo-2026-001-10',
      goodQty: 30,
      defectQty: 2,
      reworkQty: 1,
      startedAt: new Date('2026-03-25T08:00:00'),
      endedAt:   new Date('2026-03-25T10:30:00'),
    },
    {
      id: 'pr-2026-001-2',
      workOrderOperationId: 'woo-2026-001-10',
      goodQty: 25,
      defectQty: 0,
      reworkQty: 2,
      startedAt: new Date('2026-03-25T11:00:00'),
      endedAt:   new Date('2026-03-25T13:00:00'),
    },
    {
      id: 'pr-2026-001-3',
      workOrderOperationId: 'woo-2026-001-10',
      goodQty: 20,
      defectQty: 3,
      reworkQty: 0,
      startedAt: new Date('2026-03-26T08:30:00'),
      endedAt:   new Date('2026-03-26T10:00:00'),
    },
  ]

  for (const result of results) {
    await prisma.productionResult.upsert({
      where: { id: result.id },
      create: result,
      update: {},
    })
  }

  // completedQty 갱신 (총 양품 75)
  await prisma.workOrderOperation.update({
    where: { id: 'woo-2026-001-10' },
    data: { completedQty: 75 },
  })
}

async function seedCodeGroups() {
  const groups = [
    {
      id: 'cg-stop-reason',
      groupCode: 'STOP_REASON',
      groupName: '작업중단사유',
      isSystem: true,
      codes: [
        { id: 'cc-sr-01', code: 'MATERIAL_SHORT', name: '자재 부족',  displayOrder: 1 },
        { id: 'cc-sr-02', code: 'EQUIPMENT_FAIL', name: '설비 고장',  displayOrder: 2 },
        { id: 'cc-sr-03', code: 'QUALITY_HOLD',   name: '품질 보류', displayOrder: 3 },
        { id: 'cc-sr-04', code: 'BREAK',          name: '휴식',      displayOrder: 4 },
        { id: 'cc-sr-99', code: 'OTHER',          name: '기타',      displayOrder: 99 },
      ],
    },
    {
      id: 'cg-location-type',
      groupCode: 'LOCATION_TYPE',
      groupName: '로케이션유형',
      isSystem: true,
      codes: [
        { id: 'cc-lt-01', code: 'RAW',  name: '원자재 구역', displayOrder: 1 },
        { id: 'cc-lt-02', code: 'WIP',  name: '재공 구역',   displayOrder: 2 },
        { id: 'cc-lt-03', code: 'FG',   name: '완제품 구역', displayOrder: 3 },
        { id: 'cc-lt-04', code: 'QC',   name: '검사 구역',   displayOrder: 4 },
        { id: 'cc-lt-05', code: 'SHIP', name: '출하 구역',   displayOrder: 5 },
      ],
    },
    {
      id: 'cg-pack-unit',
      groupCode: 'PACK_UNIT',
      groupName: '포장단위',
      isSystem: false,
      codes: [
        { id: 'cc-pu-01', code: 'BOX',    name: '박스',   displayOrder: 1 },
        { id: 'cc-pu-02', code: 'PALLET', name: '팔레트', displayOrder: 2 },
        { id: 'cc-pu-03', code: 'DRUM',   name: '드럼',   displayOrder: 3 },
        { id: 'cc-pu-04', code: 'BAG',    name: '백',     displayOrder: 4 },
      ],
    },
    {
      id: 'cg-reject-reason',
      groupCode: 'REJECT_REASON',
      groupName: '반려사유',
      isSystem: true,
      codes: [
        { id: 'cc-rr-01', code: 'INCOMPLETE',    name: '서류 미비',   displayOrder: 1 },
        { id: 'cc-rr-02', code: 'OVER_BUDGET',   name: '예산 초과',   displayOrder: 2 },
        { id: 'cc-rr-03', code: 'SPEC_MISMATCH', name: '규격 불일치', displayOrder: 3 },
      ],
    },
    {
      id: 'cg-cost-config',
      groupCode: 'COST_CONFIG',
      groupName: '원가 설정',
      isSystem: true,
      codes: [
        { id: 'cc-cost-01', code: 'LABOR_RATE_PER_HOUR', name: '시간당 노무비 (원)', displayOrder: 1, extra: { value: 25000 } },
        { id: 'cc-cost-02', code: 'OVERHEAD_RATE',        name: '경비율 (%)',        displayOrder: 2, extra: { value: 10 } },
      ],
    },
    {
      id: 'cg-downtime-reason',
      groupCode: 'DOWNTIME_REASON',
      groupName: '비가동사유',
      isSystem: true,
      codes: [
        { id: 'cc-dr-01', code: 'EQUIP_FAIL',    name: '설비고장',         displayOrder: 1  },
        { id: 'cc-dr-02', code: 'TOOL_CHANGE',   name: '공구교체',         displayOrder: 2  },
        { id: 'cc-dr-03', code: 'MATERIAL_WAIT', name: '자재대기',         displayOrder: 3  },
        { id: 'cc-dr-04', code: 'OPERATOR_WAIT', name: '작업자대기',       displayOrder: 4  },
        { id: 'cc-dr-05', code: 'MOLD_ISSUE',    name: '금형/치공구 문제', displayOrder: 5  },
        { id: 'cc-dr-06', code: 'QUALITY_CHECK', name: '품질확인',         displayOrder: 6  },
        { id: 'cc-dr-07', code: 'PLANNED_STOP',  name: '계획정지',         displayOrder: 7  },
        { id: 'cc-dr-99', code: 'OTHER',         name: '기타',             displayOrder: 99 },
      ],
    },
  ];

  for (const group of groups) {
    await prisma.codeGroup.upsert({
      where: { id: group.id },
      create: {
        id: group.id,
        tenantId: IDS.tenant,
        groupCode: group.groupCode,
        groupName: group.groupName,
        isSystem: group.isSystem,
        isActive: true,
      },
      update: {},
    });

    for (const code of group.codes) {
      const { extra, ...rest } = code as typeof code & { extra?: object };
      await prisma.commonCode.upsert({
        where: { id: rest.id },
        create: {
          id: rest.id,
          groupId: group.id,
          code: rest.code,
          name: rest.name,
          displayOrder: rest.displayOrder,
          isActive: true,
          ...(extra ? { extra } : {}),
        },
        update: {},
      });
    }
  }
}

async function seedProductionPlans() {
  const planId = 'pp-2026-w14';
  const ppiAId = 'ppi-w14-fg-assy';
  const ppiFrameId = 'ppi-w14-semi-frame';

  await prisma.productionPlan.upsert({
    where: { id: planId },
    create: {
      id: planId,
      tenantId: IDS.tenant,
      siteId: IDS.sites.factory,
      planNo: 'PP-2026-W14',
      planType: PlanType.WEEKLY,
      startDate: new Date('2026-03-30'),
      endDate: new Date('2026-04-05'),
      status: PlanStatus.CONFIRMED,
      note: 'Phase 2a 데모 주간계획',
    },
    update: {},
  });

  await prisma.productionPlanItem.upsert({
    where: { id: ppiAId },
    create: {
      id: ppiAId,
      planId: planId,
      itemId: 'item-fg-assy-001',
      bomId: 'bom-fg-assy-001',
      routingId: 'rtg-fg-assy-001',
      plannedQty: 100,
      note: '4월 1주차 A 생산',
    },
    update: {},
  });

  await prisma.productionPlanItem.upsert({
    where: { id: ppiFrameId },
    create: {
      id: ppiFrameId,
      planId: planId,
      itemId: 'item-semi-frame-001',
      bomId: 'bom-semi-frame-001',
      routingId: 'rtg-semi-frame-001',
      plannedQty: 200,
      note: '4월 1주차 반제품 프레임 생산',
    },
    update: {},
  });

  // Link existing WorkOrders to plan items
  await prisma.workOrder.updateMany({
    where: { orderNo: 'WO-2026-001' },
    data: { productionPlanItemId: ppiAId },
  });

  await prisma.workOrder.updateMany({
    where: { orderNo: 'WO-2026-002' },
    data: { productionPlanItemId: ppiFrameId },
  });
}

async function seedRolePermissions() {
  const ALL_ACTIONS: PermissionAction[] = [
    PermissionAction.READ,
    PermissionAction.CREATE,
    PermissionAction.UPDATE,
    PermissionAction.DELETE,
    PermissionAction.APPROVE,
    PermissionAction.EXPORT,
  ];

  const ALL_RESOURCES = [
    'PRODUCTION_PLAN', 'WORK_ORDER', 'ITEM', 'BOM', 'ROUTING',
    'INVENTORY', 'QUALITY_INSPECTION', 'EQUIPMENT', 'COMMON_CODE',
    'USER_MANAGEMENT', 'AUDIT_LOG', 'APPROVAL', 'REPORT',
  ];

  const MANAGER_PERMS: Record<string, PermissionAction[]> = {
    PRODUCTION_PLAN:     [PermissionAction.READ, PermissionAction.CREATE, PermissionAction.UPDATE],
    WORK_ORDER:          [PermissionAction.READ, PermissionAction.CREATE, PermissionAction.UPDATE],
    ITEM:                [PermissionAction.READ, PermissionAction.CREATE, PermissionAction.UPDATE],
    BOM:                 [PermissionAction.READ, PermissionAction.CREATE, PermissionAction.UPDATE],
    ROUTING:             [PermissionAction.READ, PermissionAction.CREATE, PermissionAction.UPDATE],
    INVENTORY:           [PermissionAction.READ, PermissionAction.CREATE, PermissionAction.UPDATE],
    QUALITY_INSPECTION:  [PermissionAction.READ, PermissionAction.CREATE, PermissionAction.UPDATE],
    EQUIPMENT:           [PermissionAction.READ, PermissionAction.CREATE, PermissionAction.UPDATE],
    COMMON_CODE:         [PermissionAction.READ],
    USER_MANAGEMENT:     [PermissionAction.READ],
    AUDIT_LOG:           [PermissionAction.READ],
    APPROVAL:            [PermissionAction.READ, PermissionAction.CREATE, PermissionAction.APPROVE],
    REPORT:              [PermissionAction.READ, PermissionAction.EXPORT],
  };

  const OPERATOR_PERMS: Record<string, PermissionAction[]> = {
    PRODUCTION_PLAN:     [PermissionAction.READ],
    WORK_ORDER:          [PermissionAction.READ, PermissionAction.UPDATE],
    ITEM:                [PermissionAction.READ],
    BOM:                 [PermissionAction.READ],
    ROUTING:             [PermissionAction.READ],
    INVENTORY:           [PermissionAction.READ, PermissionAction.CREATE, PermissionAction.UPDATE],
    QUALITY_INSPECTION:  [PermissionAction.READ, PermissionAction.CREATE],
    EQUIPMENT:           [PermissionAction.READ],
    COMMON_CODE:         [PermissionAction.READ],
    APPROVAL:            [PermissionAction.READ, PermissionAction.CREATE],
    REPORT:              [PermissionAction.READ],
  };

  const VIEWER_RESOURCES = [
    'PRODUCTION_PLAN', 'WORK_ORDER', 'ITEM', 'BOM', 'ROUTING',
    'INVENTORY', 'QUALITY_INSPECTION', 'EQUIPMENT', 'COMMON_CODE',
    'APPROVAL', 'REPORT',
  ];

  type PermRow = {
    tenantId: string;
    role: UserRole;
    resource: string;
    action: PermissionAction;
    isAllowed: boolean;
  };

  const rows: PermRow[] = [];

  // OWNER & ADMIN: all resources, all actions
  for (const role of [UserRole.OWNER, UserRole.ADMIN]) {
    for (const resource of ALL_RESOURCES) {
      for (const action of ALL_ACTIONS) {
        rows.push({ tenantId: IDS.tenant, role, resource, action, isAllowed: true });
      }
    }
  }

  // MANAGER
  for (const [resource, actions] of Object.entries(MANAGER_PERMS)) {
    for (const action of actions) {
      rows.push({ tenantId: IDS.tenant, role: UserRole.MANAGER, resource, action, isAllowed: true });
    }
  }

  // OPERATOR
  for (const [resource, actions] of Object.entries(OPERATOR_PERMS)) {
    for (const action of actions) {
      rows.push({ tenantId: IDS.tenant, role: UserRole.OPERATOR, resource, action, isAllowed: true });
    }
  }

  // VIEWER: READ only on selected resources
  for (const resource of VIEWER_RESOURCES) {
    rows.push({ tenantId: IDS.tenant, role: UserRole.VIEWER, resource, action: PermissionAction.READ, isAllowed: true });
  }

  await prisma.rolePermission.createMany({
    data: rows,
    skipDuplicates: true,
  });
}

// ─── Equipment Integration Seed ───────────────────────────────────────────────

async function seedEquipmentIntegration() {
  // EdgeGateway
  await prisma.edgeGateway.upsert({
    where: { id: 'gw-factory-001' },
    create: {
      id: 'gw-factory-001',
      tenantId: IDS.tenant,
      siteId: IDS.sites.factory,
      name: '본공장 게이트웨이 #1',
      description: 'CNC 라인 데이터 수집용 게이트웨이',
      apiKey: 'gw-api-key-demo-001',
      status: 'ONLINE',
      lastHeartbeat: new Date(),
    },
    update: {},
  });

  // EquipmentConnection × 2
  await prisma.equipmentConnection.upsert({
    where: { equipmentId_gatewayId: { equipmentId: 'eq-cnc-001', gatewayId: 'gw-factory-001' } },
    create: {
      id: 'conn-cnc-001',
      equipmentId: 'eq-cnc-001',
      gatewayId: 'gw-factory-001',
      protocol: ConnectionProtocol.MODBUS_TCP,
      host: '192.168.1.10',
      port: 502,
      config: { slaveId: 1, registerStart: 0, registerCount: 20 },
      isActive: true,
    },
    update: {},
  });

  await prisma.equipmentConnection.upsert({
    where: { equipmentId_gatewayId: { equipmentId: 'eq-cnc-002', gatewayId: 'gw-factory-001' } },
    create: {
      id: 'conn-cnc-002',
      equipmentId: 'eq-cnc-002',
      gatewayId: 'gw-factory-001',
      protocol: ConnectionProtocol.MODBUS_TCP,
      host: '192.168.1.11',
      port: 502,
      config: { slaveId: 2, registerStart: 0, registerCount: 20 },
      isActive: true,
    },
    update: {},
  });

  // DataTag × 6
  const tags = [
    {
      id: 'tag-cnc001-temp',
      connectionId: 'conn-cnc-001',
      tagCode: 'TEMP_001',
      displayName: '스핀들 온도',
      dataType: TagDataType.FLOAT,
      unit: '°C',
      category: TagCategory.PROCESS,
      plcAddress: 'D100',
      scaleFactor: 0.1,
      samplingMs: 1000,
    },
    {
      id: 'tag-cnc001-pressure',
      connectionId: 'conn-cnc-001',
      tagCode: 'PRESS_001',
      displayName: '유압 압력',
      dataType: TagDataType.FLOAT,
      unit: 'bar',
      category: TagCategory.PROCESS,
      plcAddress: 'D102',
      scaleFactor: 0.01,
      samplingMs: 500,
    },
    {
      id: 'tag-cnc001-spindle',
      connectionId: 'conn-cnc-001',
      tagCode: 'RPM_001',
      displayName: '스핀들 회전수',
      dataType: TagDataType.INT,
      unit: 'rpm',
      category: TagCategory.PROCESS,
      plcAddress: 'D104',
      samplingMs: 200,
    },
    {
      id: 'tag-cnc001-status',
      connectionId: 'conn-cnc-001',
      tagCode: 'STATUS_001',
      displayName: '설비 가동 상태',
      dataType: TagDataType.BOOL,
      unit: null,
      category: TagCategory.STATUS,
      plcAddress: 'M0',
      samplingMs: 1000,
    },
    {
      id: 'tag-cnc002-cycle',
      connectionId: 'conn-cnc-002',
      tagCode: 'CYCLE_001',
      displayName: '사이클 타임',
      dataType: TagDataType.FLOAT,
      unit: 's',
      category: TagCategory.COUNTER,
      plcAddress: 'D200',
      scaleFactor: 0.1,
      samplingMs: 1000,
    },
    {
      id: 'tag-cnc002-alarm',
      connectionId: 'conn-cnc-002',
      tagCode: 'ALARM_001',
      displayName: '알람 상태코드',
      dataType: TagDataType.INT,
      unit: null,
      category: TagCategory.ALARM,
      plcAddress: 'D202',
      samplingMs: 500,
    },
  ] as const;

  for (const tag of tags) {
    await prisma.dataTag.upsert({
      where: { connectionId_tagCode: { connectionId: tag.connectionId, tagCode: tag.tagCode } },
      create: {
        id: tag.id,
        connectionId: tag.connectionId,
        tagCode: tag.tagCode,
        displayName: tag.displayName,
        dataType: tag.dataType,
        unit: tag.unit ?? null,
        category: tag.category,
        plcAddress: tag.plcAddress,
        scaleFactor: (tag as any).scaleFactor ?? null,
        samplingMs: tag.samplingMs,
        isActive: true,
      },
      update: {},
    });
  }
}

async function seedItemCosts() {
  console.log("  Seeding item costs...")

  const tenantId = IDS.tenant

  const finishedItem = await prisma.item.findFirst({
    where: { tenantId, itemType: { in: ['FINISHED', 'SEMI_FINISHED'] } },
    orderBy: { code: 'asc' },
  })

  if (!finishedItem) {
    console.log("  Skipping item costs (no finished items)")
    return
  }

  const bom = await prisma.bOM.findFirst({
    where: { itemId: finishedItem.id, isDefault: true },
  })

  const workOrder = await prisma.workOrder.findFirst({
    where: { itemId: finishedItem.id, status: 'COMPLETED' },
  })

  await prisma.itemCost.upsert({
    where: { id: 'ic-standard-001' },
    update: {},
    create: {
      id: 'ic-standard-001',
      tenantId,
      itemId: finishedItem.id,
      costType: 'STANDARD',
      materialCost: 45000,
      laborCost: 18000,
      overheadCost: 4500,
      totalCost: 67500,
      bomId: bom?.id ?? null,
      calculatedAt: new Date('2026-03-01'),
      note: '표준원가 시드',
    },
  })

  await prisma.itemCost.upsert({
    where: { id: 'ic-actual-001' },
    update: {},
    create: {
      id: 'ic-actual-001',
      tenantId,
      itemId: finishedItem.id,
      costType: 'ACTUAL',
      materialCost: 47000,
      laborCost: 16500,
      overheadCost: 4700,
      totalCost: 68200,
      workOrderId: workOrder?.id ?? null,
      calculatedAt: new Date('2026-03-15'),
      note: '실제원가 시드',
    },
  })

  console.log("  Item costs seeded")
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seedFeatures() {
  const features = [
    // MASTER
    { code: 'ITEM', name: '품목관리', description: '품목 마스터 데이터 관리', category: 'MASTER', icon: 'Package', menuCodes: ['items', 'item-categories', 'item-groups', 'sites', 'locations'], isCore: true, displayOrder: 10 },
    { code: 'BOM', name: 'BOM 관리', description: '자재명세서(BOM) 관리', category: 'MASTER', icon: 'GitBranch', menuCodes: ['bom'], isCore: false, displayOrder: 20 },
    { code: 'ROUTING', name: '공정/라우팅', description: '생산 공정 및 라우팅 관리', category: 'MASTER', icon: 'Network', menuCodes: ['routing', 'work-centers'], isCore: false, displayOrder: 30 },
    { code: 'EQUIPMENT', name: '설비관리', description: '생산 설비 마스터 관리', category: 'MASTER', icon: 'Cpu', menuCodes: ['equipment'], isCore: false, displayOrder: 40 },
    // PRODUCTION
    { code: 'WORK_ORDER', name: '작업지시', description: '작업지시 생성 및 관리', category: 'PRODUCTION', icon: 'ClipboardList', menuCodes: ['work-orders', 'work-queue'], isCore: false, displayOrder: 50 },
    { code: 'PRODUCTION_PLAN', name: '생산계획', description: '일간/주간/월간 생산계획', category: 'PRODUCTION', icon: 'CalendarDays', menuCodes: ['production-plan'], isCore: false, displayOrder: 60 },
    { code: 'PRODUCTION_RESULT', name: '작업실적', description: '공정별 생산실적 입력', category: 'PRODUCTION', icon: 'BarChart2', menuCodes: ['production-results', 'equipment-output'], isCore: false, displayOrder: 70 },
    // MATERIAL
    { code: 'INVENTORY', name: '재고관리', description: '자재/제품 재고 관리', category: 'MATERIAL', icon: 'Boxes', menuCodes: ['inventory', 'inventory-transactions', 'stock', 'wip-inventory'], isCore: false, displayOrder: 80 },
    { code: 'LOT_TRACKING', name: 'LOT/시리얼 추적', description: 'LOT/시리얼 단위 이력 추적 및 번호 규칙 설정', category: 'MATERIAL', icon: 'ScanLine', menuCodes: ['lot', 'lot-rules', 'traceability', 'lot-history', 'manufacturing-traceability'], isCore: false, displayOrder: 90 },
    // QUALITY
    { code: 'QUALITY_INSPECTION', name: '공정검사', description: '생산 공정 품질 검사', category: 'QUALITY', icon: 'CheckCircle', menuCodes: ['inspection', 'work-standards'], isCore: false, displayOrder: 100 },
    { code: 'DEFECT_MANAGEMENT', name: '불량관리', description: '불량 분석 및 관리', category: 'QUALITY', icon: 'AlertTriangle', menuCodes: ['defects', 'ecn', 'defect-stats'], isCore: false, displayOrder: 110 },
    // EQUIPMENT
    { code: 'EQUIPMENT_CONNECTION', name: '설비연동', description: 'PLC/설비 데이터 연동', category: 'EQUIPMENT', icon: 'Wifi', menuCodes: ['gateways', 'equipment-connections'], isCore: false, displayOrder: 120 },
    { code: 'TAG_MANAGEMENT', name: '태그관리', description: '설비 데이터 태그 관리', category: 'EQUIPMENT', icon: 'Tag', menuCodes: ['tags'], isCore: false, displayOrder: 130 },
    // SYSTEM
    { code: 'COMMON_CODE', name: '공통코드', description: '시스템 공통 코드 관리', category: 'SYSTEM', icon: 'BookOpen', menuCodes: ['common-codes'], isCore: true, displayOrder: 140 },
    { code: 'PERMISSION', name: '권한관리', description: '역할별 권한 관리', category: 'SYSTEM', icon: 'Shield', menuCodes: ['users'], isCore: true, displayOrder: 150 },
    { code: 'FEATURE_MANAGEMENT', name: '기능관리', description: '테넌트 기능 ON/OFF 관리', category: 'SYSTEM', icon: 'Puzzle', menuCodes: ['features'], isCore: true, displayOrder: 160 },
    // SALES
    { code: 'SALES_ORDER', name: '수주관리', description: '수주/출하 관리', category: 'SALES', icon: 'ClipboardList', menuCodes: ['sales-orders', 'shipments', 'order-status', 'delivery-status'], isCore: false, displayOrder: 151 },
    { code: 'SHIPMENT', name: '출하관리', description: '출하 관리', category: 'SALES', icon: 'Truck', menuCodes: ['shipments'], isCore: false, displayOrder: 152 },
    // PURCHASE
    { code: 'PURCHASE_ORDER', name: '발주관리', description: '발주/입고 관리', category: 'PURCHASE', icon: 'FileInput', menuCodes: ['purchase-orders', 'material-receipt', 'material-issue', 'outsourcing'], isCore: false, displayOrder: 161 },
    { code: 'ITEM_PRICE', name: '단가관리', description: '품목 단가 관리', category: 'PURCHASE', icon: 'CircleDollarSign', menuCodes: ['item-prices'], isCore: false, displayOrder: 162 },
    // MRP
    { code: 'MRP', name: 'MRP 소요량', description: '자재 소요량 계획 및 AI 발주 제안', category: 'PRODUCTION', icon: 'Calculator', menuCodes: ['mrp'], isCore: false, displayOrder: 141 },
    // QUOTATION
    { code: 'QUOTATION', name: '견적관리', description: '고객 견적서 관리 및 수주 전환', category: 'SALES', icon: 'FileText', menuCodes: ['quotations'], isCore: false, displayOrder: 50 },
    // ANALYTICS
    { code: 'COSTING', name: '원가분석', description: 'BOM 기반 표준원가와 실적 기반 실제원가 비교', category: 'ANALYTICS', icon: 'Calculator', menuCodes: ['costing'], isCore: false, displayOrder: 90 },
    // PARTNER
    { code: 'PARTNER_MANAGEMENT', name: '고객사/거래처 관리', description: '고객사 및 거래처 마스터 관리', category: 'MASTER', icon: 'Handshake', menuCodes: ['customers', 'vendors'], isCore: false, displayOrder: 15 },
    // LMS + 모니터링 + 검사
    { code: 'EQUIPMENT_MANAGEMENT', name: '설비관리(LMS)', description: '설비 수리요청, 일상점검, 문제유형 관리', category: 'EQUIPMENT', icon: 'Wrench', menuCodes: ['equipment-repair', 'equipment-check', 'equipment-problems', 'equipment-check-status', 'equipment-statistics', 'molds', 'parameters', 'errors', 'capacity'], isCore: false, displayOrder: 125 },
    { code: 'EQUIPMENT_MONITOR', name: '설비 현황 모니터링', description: '실시간 설비 가동 상태 모니터링', category: 'EQUIPMENT', icon: 'Activity', menuCodes: ['equipment-monitor', 'status'], isCore: false, displayOrder: 126 },
    { code: 'INSPECTION_STAGES', name: '초·중·종 검사', description: '초물/중간/종물 단계별 품질검사', category: 'QUALITY', icon: 'ListChecks', menuCodes: ['inspection-stages', 'inspection-standards'], isCore: false, displayOrder: 105 },
    { code: 'DASHBOARD', name: '생산현황 대시보드', description: 'KPI 및 생산현황 종합 대시보드', category: 'ANALYTICS', icon: 'LayoutDashboard', menuCodes: ['dashboard', 'kpi'], isCore: false, displayOrder: 80 },
  ];

  for (const f of features) {
    await prisma.featureDefinition.upsert({
      where: { code: f.code },
      update: { ...f },
      create: { ...f },
    });
  }

  // 의존성 시드
  const allFeatures = await prisma.featureDefinition.findMany();
  const featureMap = Object.fromEntries(allFeatures.map((f) => [f.code, f.id]));

  const deps = [
    { from: 'BOM', to: 'ITEM', required: true },
    { from: 'ROUTING', to: 'ITEM', required: true },
    { from: 'WORK_ORDER', to: 'ITEM', required: true },
    { from: 'WORK_ORDER', to: 'BOM', required: true },
    { from: 'WORK_ORDER', to: 'ROUTING', required: true },
    { from: 'PRODUCTION_PLAN', to: 'ITEM', required: true },
    { from: 'PRODUCTION_PLAN', to: 'WORK_ORDER', required: false },
    { from: 'PRODUCTION_RESULT', to: 'WORK_ORDER', required: true },
    { from: 'INVENTORY', to: 'ITEM', required: true },
    { from: 'LOT_TRACKING', to: 'INVENTORY', required: true },
    { from: 'QUALITY_INSPECTION', to: 'WORK_ORDER', required: true },
    { from: 'DEFECT_MANAGEMENT', to: 'QUALITY_INSPECTION', required: true },
    { from: 'TAG_MANAGEMENT', to: 'EQUIPMENT', required: true },
    { from: 'TAG_MANAGEMENT', to: 'EQUIPMENT_CONNECTION', required: true },
  ];

  for (const dep of deps) {
    if (!featureMap[dep.from] || !featureMap[dep.to]) continue;
    await prisma.featureDependency.upsert({
      where: {
        featureId_dependsOnId: {
          featureId: featureMap[dep.from],
          dependsOnId: featureMap[dep.to],
        },
      },
      update: { isRequired: dep.required },
      create: {
        featureId: featureMap[dep.from],
        dependsOnId: featureMap[dep.to],
        isRequired: dep.required,
      },
    });
  }

  // 데모 테넌트 기능 활성화
  const tenant = await prisma.tenant.findFirst();
  if (tenant) {
    const enableCodes = [
      'ITEM', 'BOM', 'ROUTING', 'EQUIPMENT', 'WORK_ORDER', 'PRODUCTION_PLAN',
      'PRODUCTION_RESULT', 'QUALITY_INSPECTION', 'DEFECT_MANAGEMENT',
      'COMMON_CODE', 'PERMISSION', 'FEATURE_MANAGEMENT',
      'SALES_ORDER', 'PURCHASE_ORDER', 'ITEM_PRICE', 'MRP',
      'COSTING', 'PARTNER_MANAGEMENT',
      'EQUIPMENT_MANAGEMENT', 'EQUIPMENT_MONITOR', 'INSPECTION_STAGES', 'DASHBOARD',
      'EQUIPMENT_CONNECTION', 'TAG_MANAGEMENT', 'QUOTATION', 'INVENTORY', 'LOT_TRACKING',
    ];
    for (const code of enableCodes) {
      const feat = await prisma.featureDefinition.findUnique({ where: { code } });
      if (!feat) continue;
      await prisma.tenantFeature.upsert({
        where: { tenantId_featureId: { tenantId: tenant.id, featureId: feat.id } },
        update: { isEnabled: true },
        create: { tenantId: tenant.id, featureId: feat.id, isEnabled: true },
      });
    }
  }
}

async function seedSalesOrders() {
  const customer = await prisma.businessPartner.findFirst({
    where: { tenantId: IDS.tenant, partnerType: { in: ['CUSTOMER', 'BOTH'] } },
  });
  const customer2 = await prisma.businessPartner.findFirst({
    where: { tenantId: IDS.tenant, partnerType: { in: ['CUSTOMER', 'BOTH'] }, id: { not: customer?.id } },
  });
  if (!customer) return;

  const items = await prisma.item.findMany({
    where: { tenantId: IDS.tenant, itemType: { in: ['FINISHED', 'SEMI_FINISHED'] } },
    take: 3,
  });
  if (items.length === 0) return;

  const so1 = await prisma.salesOrder.upsert({
    where: { tenantId_orderNo: { tenantId: IDS.tenant, orderNo: 'SO-2026-001' } },
    update: {},
    create: {
      tenantId: IDS.tenant,
      siteId: IDS.sites.factory,
      customerId: customer.id,
      orderNo: 'SO-2026-001',
      orderDate: new Date('2026-03-01'),
      deliveryDate: new Date('2026-04-01'),
      status: SalesOrderStatus.PARTIAL_SHIPPED,
      currency: 'KRW',
      note: '1분기 정기 주문',
    },
  });

  if (items[0]) {
    await prisma.salesOrderItem.upsert({
      where: { salesOrderId_itemId: { salesOrderId: so1.id, itemId: items[0].id } },
      update: {},
      create: { salesOrderId: so1.id, itemId: items[0].id, qty: 100, unitPrice: 50000, shippedQty: 50 },
    });
  }
  if (items[1]) {
    await prisma.salesOrderItem.upsert({
      where: { salesOrderId_itemId: { salesOrderId: so1.id, itemId: items[1].id } },
      update: {},
      create: { salesOrderId: so1.id, itemId: items[1].id, qty: 200, unitPrice: 30000 },
    });
  }

  const so2Customer = customer2 ?? customer;
  const so2 = await prisma.salesOrder.upsert({
    where: { tenantId_orderNo: { tenantId: IDS.tenant, orderNo: 'SO-2026-002' } },
    update: {},
    create: {
      tenantId: IDS.tenant,
      siteId: IDS.sites.factory,
      customerId: so2Customer.id,
      orderNo: 'SO-2026-002',
      orderDate: new Date('2026-03-15'),
      deliveryDate: new Date('2026-04-30'),
      status: SalesOrderStatus.IN_PRODUCTION,
      currency: 'KRW',
    },
  });
  if (items[0]) {
    await prisma.salesOrderItem.upsert({
      where: { salesOrderId_itemId: { salesOrderId: so2.id, itemId: items[0].id } },
      update: {},
      create: { salesOrderId: so2.id, itemId: items[0].id, qty: 50, unitPrice: 50000 },
    });
  }

  // ShipmentOrder
  const sh1Item = await prisma.salesOrderItem.findFirst({ where: { salesOrderId: so1.id } });
  if (sh1Item) {
    await prisma.shipmentOrder.upsert({
      where: { tenantId_shipmentNo: { tenantId: IDS.tenant, shipmentNo: 'SH-2026-001' } },
      update: {},
      create: {
        tenantId: IDS.tenant,
        siteId: IDS.sites.factory,
        salesOrderId: so1.id,
        shipmentNo: 'SH-2026-001',
        status: ShipmentStatus.SHIPPED,
        plannedDate: new Date('2026-03-20'),
        shippedDate: new Date('2026-03-22'),
        items: {
          create: [{ salesOrderItemId: sh1Item.id, itemId: sh1Item.itemId, qty: 50 }],
        },
      },
    });
  }
}

async function seedPurchaseData() {
  const supplier = await prisma.businessPartner.findFirst({
    where: { tenantId: IDS.tenant, partnerType: { in: ['SUPPLIER', 'BOTH'] } },
  });
  if (!supplier) return;

  const rawItems = await prisma.item.findMany({
    where: { tenantId: IDS.tenant, itemType: { in: ['RAW_MATERIAL', 'SEMI_FINISHED', 'CONSUMABLE'] } },
    take: 2,
  });
  if (rawItems.length === 0) return;

  // ItemPrice
  for (const item of rawItems) {
    const priceId = `price-${item.id.slice(-8)}-${supplier.id.slice(-8)}`;
    await prisma.itemPrice.upsert({
      where: { id: priceId },
      update: {},
      create: {
        id: priceId,
        tenantId: IDS.tenant,
        itemId: item.id,
        partnerId: supplier.id,
        priceType: 'PURCHASE',
        unitPrice: 10000,
        currency: 'KRW',
        effectiveFrom: new Date('2026-01-01'),
        note: '기본 단가',
      },
    });
  }

  // PurchaseOrder 1
  const po1 = await prisma.purchaseOrder.upsert({
    where: { tenantId_orderNo: { tenantId: IDS.tenant, orderNo: 'PO-2026-001' } },
    update: {},
    create: {
      tenantId: IDS.tenant,
      siteId: IDS.sites.factory,
      supplierId: supplier.id,
      orderNo: 'PO-2026-001',
      orderDate: new Date('2026-03-01'),
      expectedDate: new Date('2026-03-15'),
      status: PurchaseOrderStatus.ORDERED,
      currency: 'KRW',
      note: '1분기 원자재 발주',
    },
  });
  if (rawItems[0]) {
    await prisma.purchaseOrderItem.upsert({
      where: { purchaseOrderId_itemId: { purchaseOrderId: po1.id, itemId: rawItems[0].id } },
      update: {},
      create: { purchaseOrderId: po1.id, itemId: rawItems[0].id, qty: 100, unitPrice: 10000 },
    });
  }

  // PurchaseOrder 2 - DRAFT
  const po2 = await prisma.purchaseOrder.upsert({
    where: { tenantId_orderNo: { tenantId: IDS.tenant, orderNo: 'PO-2026-002' } },
    update: {},
    create: {
      tenantId: IDS.tenant,
      siteId: IDS.sites.factory,
      supplierId: supplier.id,
      orderNo: 'PO-2026-002',
      orderDate: new Date('2026-03-20'),
      expectedDate: new Date('2026-04-05'),
      status: PurchaseOrderStatus.DRAFT,
      currency: 'KRW',
    },
  });
  for (const item of rawItems) {
    await prisma.purchaseOrderItem.upsert({
      where: { purchaseOrderId_itemId: { purchaseOrderId: po2.id, itemId: item.id } },
      update: {},
      create: { purchaseOrderId: po2.id, itemId: item.id, qty: 50, unitPrice: 10000 },
    });
  }

  // 공급사2 조회
  const supplier2 = await prisma.businessPartner.findUnique({ where: { id: IDS.businessPartners.supplier2 } });

  // PurchaseOrder 3 - ORDERED (입고대기) - supplier2
  const po3 = await prisma.purchaseOrder.upsert({
    where: { tenantId_orderNo: { tenantId: IDS.tenant, orderNo: 'PO-2026-003' } },
    update: { status: PurchaseOrderStatus.ORDERED },
    create: {
      tenantId: IDS.tenant,
      siteId: IDS.sites.factory,
      supplierId: supplier2?.id ?? supplier.id,
      orderNo: 'PO-2026-003',
      orderDate: new Date('2026-03-10'),
      expectedDate: new Date('2026-03-25'),
      status: PurchaseOrderStatus.ORDERED,
      currency: 'KRW',
      note: '긴급 원자재 발주',
    },
  });
  if (rawItems[1]) {
    await prisma.purchaseOrderItem.upsert({
      where: { purchaseOrderId_itemId: { purchaseOrderId: po3.id, itemId: rawItems[1].id } },
      update: {},
      create: { purchaseOrderId: po3.id, itemId: rawItems[1].id, qty: 200, unitPrice: 8000 },
    });
  }
  if (rawItems[2]) {
    await prisma.purchaseOrderItem.upsert({
      where: { purchaseOrderId_itemId: { purchaseOrderId: po3.id, itemId: rawItems[2].id } },
      update: {},
      create: { purchaseOrderId: po3.id, itemId: rawItems[2].id, qty: 150, unitPrice: 12000 },
    });
  }

  // PurchaseOrder 4 - PARTIAL_RECEIVED (부분입고) - supplier1
  const po4 = await prisma.purchaseOrder.upsert({
    where: { tenantId_orderNo: { tenantId: IDS.tenant, orderNo: 'PO-2026-004' } },
    update: { status: PurchaseOrderStatus.PARTIAL_RECEIVED },
    create: {
      tenantId: IDS.tenant,
      siteId: IDS.sites.factory,
      supplierId: supplier.id,
      orderNo: 'PO-2026-004',
      orderDate: new Date('2026-03-05'),
      expectedDate: new Date('2026-03-20'),
      status: PurchaseOrderStatus.PARTIAL_RECEIVED,
      currency: 'KRW',
      note: '소모품 정기 발주 (부분입고)',
    },
  });
  if (rawItems[0]) {
    await prisma.purchaseOrderItem.upsert({
      where: { purchaseOrderId_itemId: { purchaseOrderId: po4.id, itemId: rawItems[0].id } },
      update: {},
      create: { purchaseOrderId: po4.id, itemId: rawItems[0].id, qty: 300, unitPrice: 9500, receivedQty: 100 },
    });
  }

  // PurchaseOrder 5 - ORDERED (입고대기) - supplier2
  const po5 = await prisma.purchaseOrder.upsert({
    where: { tenantId_orderNo: { tenantId: IDS.tenant, orderNo: 'PO-2026-005' } },
    update: { status: PurchaseOrderStatus.ORDERED },
    create: {
      tenantId: IDS.tenant,
      siteId: IDS.sites.factory,
      supplierId: supplier2?.id ?? supplier.id,
      orderNo: 'PO-2026-005',
      orderDate: new Date('2026-03-25'),
      expectedDate: new Date('2026-04-10'),
      status: PurchaseOrderStatus.ORDERED,
      currency: 'KRW',
      note: '2분기 원자재 사전 발주',
    },
  });
  for (const item of rawItems.slice(0, 2)) {
    await prisma.purchaseOrderItem.upsert({
      where: { purchaseOrderId_itemId: { purchaseOrderId: po5.id, itemId: item.id } },
      update: {},
      create: { purchaseOrderId: po5.id, itemId: item.id, qty: 500, unitPrice: 9000 },
    });
  }
}

async function seedQuotations() {
  console.log("  Seeding quotations...")

  const firstSO = await prisma.salesOrder.findFirst({
    where: { tenantId: IDS.tenant },
    orderBy: { createdAt: 'asc' },
  })

  const site = await prisma.site.findFirst({ where: { tenantId: IDS.tenant } })
  const customer1 = await prisma.businessPartner.findFirst({
    where: { tenantId: IDS.tenant, partnerType: { in: ['CUSTOMER', 'BOTH'] } },
    orderBy: { code: 'asc' },
  })
  const customer2 = await prisma.businessPartner.findFirst({
    where: { tenantId: IDS.tenant, partnerType: { in: ['CUSTOMER', 'BOTH'] } },
    orderBy: { code: 'desc' },
  })

  const finishedItems = await prisma.item.findMany({
    where: { tenantId: IDS.tenant, itemType: { in: ['FINISHED', 'SEMI_FINISHED'] } },
    take: 3,
  })

  if (!site || !customer1 || finishedItems.length === 0) {
    console.log("  Skipping quotations (missing prerequisite data)")
    return
  }

  // QT-2026-001: WON, 수주 연결됨
  await prisma.quotation.upsert({
    where: { tenantId_quotationNo: { tenantId: IDS.tenant, quotationNo: 'QT-2026-001' } },
    update: {},
    create: {
      id: IDS.quotations.qt1,
      tenantId: IDS.tenant,
      siteId: site.id,
      customerId: customer1.id,
      quotationNo: 'QT-2026-001',
      quotationDate: new Date('2026-02-15'),
      validUntil: new Date('2026-03-15'),
      status: 'WON',
      currency: 'KRW',
      totalAmount: finishedItems[0] ? 5000000 : 0,
      convertedSalesOrderId: firstSO?.id ?? null,
      note: '견적 시드 데이터 (확정)',
      items: {
        create: finishedItems.slice(0, 2).map((item, i) => ({
          itemId: item.id,
          qty: (i + 1) * 10,
          unitPrice: 250000 + i * 50000,
        })),
      },
    },
  })

  // QT-2026-002: SUBMITTED
  if (customer2 && customer2.id !== customer1.id) {
    await prisma.quotation.upsert({
      where: { tenantId_quotationNo: { tenantId: IDS.tenant, quotationNo: 'QT-2026-002' } },
      update: {},
      create: {
        id: IDS.quotations.qt2,
        tenantId: IDS.tenant,
        siteId: site.id,
        customerId: customer2.id,
        quotationNo: 'QT-2026-002',
        quotationDate: new Date('2026-03-20'),
        validUntil: new Date('2026-04-30'),
        status: 'SUBMITTED',
        currency: 'KRW',
        totalAmount: finishedItems[0] ? 3000000 : 0,
        note: '견적 시드 데이터 (제출)',
        items: {
          create: [{
            itemId: finishedItems[0].id,
            qty: 12,
            unitPrice: 250000,
          }],
        },
      },
    })
  }

  console.log("  Quotations seeded")
}

const SEED_CREDENTIALS = [
  { profileId: IDS.profiles.admin,    loginId: 'admin',    password: 'Admin@1234' },
  { profileId: IDS.profiles.manager,  loginId: 'manager',  password: 'Manager@1234' },
  { profileId: IDS.profiles.operator, loginId: 'operator', password: 'Operator@1234' },
] as const;

async function seedUserCredentials() {
  for (const cred of SEED_CREDENTIALS) {
    const loginId = cred.loginId.trim().toLowerCase();
    const existing = await prisma.userCredential.findUnique({
      where: { profileId: cred.profileId },
    });
    if (existing) continue;

    const passwordHash = await bcrypt.hash(cred.password, 12);
    await prisma.userCredential.create({
      data: {
        tenantId: IDS.tenant,
        loginId,
        profileId: cred.profileId,
        passwordHash,
        mustChangePw: false,
        isLocked: false,
        failCount: 0,
      },
    });
    console.log(`    ✓ loginId=${loginId}`);
  }
}

async function main() {
  console.log('▶ MES 기준정보 시드 시작...\n');
  console.log(`  [mode] SEED_MODE=${SEED_MODE}`);
  if (requestedSeedMode && requestedSeedMode !== SEED_MODE) {
    console.warn(`  - 알 수 없는 SEED_MODE=${requestedSeedMode}; 안전한 base 모드로 실행합니다.`);
  }

  console.log('  [1/11] Tenant');
  await seedTenant();

  console.log('  [2/11] Profiles');
  await seedProfiles();

  console.log('  [3/11] Sites');
  await seedSites();

  console.log('  [4/11] TenantUsers');
  await seedTenantUsers();

  console.log('  [4+] UserCredentials (demo)');
  await seedUserCredentials();

  console.log('  [5/11] WorkCenters');
  await seedWorkCenters();

  if (SEED_MODE === 'demo') {
    console.log('  [6/11] Equipments');
    await seedEquipments();
  } else {
    console.log('  [6/11] Equipments skipped (SEED_MODE=demo only)');
  }

  console.log('  [7/11] ItemCategories');
  await seedItemCategories();

  console.log('  [8/11] Warehouses + Locations');
  await seedWarehouses();
  await seedLocations();

  if (SEED_MODE === 'demo') {
    console.log('  [9/11] BusinessPartners');
    await seedBusinessPartners();
  } else {
    console.log('  [9/11] BusinessPartners skipped (SEED_MODE=demo only)');
  }

  console.log('  [10/11] DefectCodes');
  await seedDefectCodes();

  console.log('  [11/11] Items + NumberingRules');
  await seedItems();
  await seedNumberingRules();

  console.log('  [12/14] BOMs + BOMItems');
  await seedBoms();

  console.log('  [13/14] Routings + RoutingOperations');
  await seedRoutings();

  console.log('  [13+] InspectionSpecs');
  await seedInspectionSpecs();

  if (SEED_MODE === 'demo') {
    console.log('  [14/17] WorkOrders + WorkOrderOperations');
    await seedWorkOrders();

    console.log('  [14+] ProductionResults');
    await seedProductionResults();
  } else {
    console.log('  [14/17] WorkOrders + ProductionResults skipped (SEED_MODE=demo only)');
  }

  console.log('  [15/17] CodeGroups + CommonCodes');
  await seedCodeGroups();

  if (SEED_MODE === 'demo') {
    console.log('  [16/17] ProductionPlans + PlanItems');
    await seedProductionPlans();
  } else {
    console.log('  [16/17] ProductionPlans skipped (SEED_MODE=demo only)');
  }

  console.log('  [17/17] RolePermissions');
  await seedRolePermissions();

  console.log('  [18/18] FeatureDefinitions + Dependencies + TenantFeatures');
  await seedFeatures();

  if (SEED_MODE === 'demo') {
    console.log('  [19/19] Equipment Integration (Gateway + Connections + Tags)');
    await seedEquipmentIntegration();

    console.log('  [20/21] SalesOrders + ShipmentOrders');
    await seedSalesOrders();

    console.log('  [21/22] PurchaseOrders + ItemPrices');
    await seedPurchaseData();

    console.log('  [22/22] Quotations');
    await seedQuotations();

    console.log('  [23/23] ItemCosts');
    await seedItemCosts();

    console.log('  [24/24] EngineeringChanges (ECN)');
    await seedECNs();

    console.log('  [25/26] Lots (LOT 관리 반제품 seed)');
    await seedLots();

    console.log('  [26/26] InventoryBalances');
    await seedInventoryBalances();
  } else {
    console.log('  [19/26] Operational demo data skipped (SEED_MODE=demo only)');
  }

  console.log(
    SEED_MODE === 'demo'
      ? '  [27/27] Medical traceability demo data v2'
      : '  [27/27] Medical traceability demo data v2 cleanup only',
  );
  await seedMedicalTraceabilityDemoV2(SEED_MODE);

  console.log('\n✔ 시드 완료');
  console.log('  - Tenant: 1');
  console.log('  - Profile: 3 (admin / manager / operator)');
  console.log('  - UserCredential: admin/Admin@1234  manager/Manager@1234  operator/Operator@1234');
  console.log('  - Site: 2 (본공장 / 물류창고)');
  console.log('  - TenantUser: 3');
  console.log('  - WorkCenter: 6');
  console.log(SEED_MODE === 'demo' ? '  - Equipment: 4' : '  - Equipment: 미생성 (demo 전용)');
  console.log('  - ItemCategory: 6 (4 루트 + 2 원자재 하위)');
  console.log('  - Warehouse: 3 / Location: 8');
  console.log(
    SEED_MODE === 'demo' ? '  - BusinessPartner: 5' : '  - BusinessPartner: 미생성 (demo 전용)',
  );
  console.log('  - DefectCode: 7');
  console.log('  - Item: 8 / NumberingRule: 2 (LOT + SERIAL)');
  console.log('  - BOM: 2 / BOMItem: 5');
  console.log('  - Routing: 3 / RoutingOperation: 12');
  console.log(
    SEED_MODE === 'demo'
      ? '  - WorkOrder: 기본 3 + Seed v2 5 / WorkOrderOperation: 기본 9 + Seed v2 25'
      : '  - WorkOrder: 미생성 (demo 전용)',
  );
  console.log(
    SEED_MODE === 'demo'
      ? '  - ProductionResult: 기본 3 + Seed v2 25'
      : '  - ProductionResult: 미생성 (demo 전용)',
  );
  console.log('  - CodeGroup: 6 / CommonCode: 27');
  console.log(
    SEED_MODE === 'demo'
      ? '  - ProductionPlan: 1 / PlanItem: 2'
      : '  - ProductionPlan: 미생성 (demo 전용)',
  );
  console.log('  - RolePermission: ~212 (5 roles × 13 resources)');
  console.log('  - FeatureDefinition: 20 / FeatureDependency: 14 / TenantFeature: 12');
  console.log(
    SEED_MODE === 'demo'
      ? '  - EdgeGateway: 1 / EquipmentConnection: 2 / DataTag: 6'
      : '  - Equipment Integration: 미생성 (demo 전용)',
  );
  console.log(
    SEED_MODE === 'demo'
      ? '  - SalesOrder: 기본 2 + Seed v2 1 / ShipmentOrder: 기본 1 + Seed v2 1'
      : '  - SalesOrder / ShipmentOrder: 미생성 (demo 전용)',
  );
  console.log(
    SEED_MODE === 'demo'
      ? '  - PurchaseOrder: 2 / ItemPrice: N건'
      : '  - PurchaseOrder / ItemPrice: 미생성 (demo 전용)',
  );
  console.log(
    SEED_MODE === 'demo'
      ? '  - Quotation: 2 / QuotationItem: 3'
      : '  - Quotation: 미생성 (demo 전용)',
  );
  console.log(
    SEED_MODE === 'demo'
      ? '  - InventoryBalance: 기본 시작 재고 + Seed v2 LOT 재고'
      : '  - InventoryBalance: 미생성 (demo 전용)',
  );
  console.log(
    SEED_MODE === 'demo'
      ? '  - Medical Traceability Seed v2: WorkOrder 5 / 정상·SCRAP·최종 REWORK·중간 REWORK·레거시 REWORK'
      : '  - Medical Traceability Seed v2: 미생성 (기존 demo prefix 데이터 정리)',
  );
}

async function seedLots() {
  // LOT 관리 반제품에 대해 seed Lot 레코드를 생성한다.
  // @@unique([tenantId, lotNo]) 기반 upsert — 기존 row는 update:{} 로 유지.
  //
  // SF-FRAME-001: LOT-20260521-001 은 UI 자재입고로 이미 생성된 row 를 그대로 보존.
  // SF-SHAFT-001: 기존 DB 에 존재하는 LOT-20260521-002 는 다른 품목 itemId 를 가지므로
  //   재사용하지 않고, SF-SHAFT-001 전용 lotNo(LOT-SHAFT-20260524-001)를 신규 생성한다.

  // SF-FRAME-001 — 기존 LOT 보존용 upsert (create 는 멱등성 목적, update 는 변경 없음)
  await prisma.lot.upsert({
    where: { tenantId_lotNo: { tenantId: IDS.tenant, lotNo: 'LOT-20260521-001' } },
    create: {
      id: 'lot-frame-20260521-001',
      tenantId: IDS.tenant,
      itemId: 'item-semi-frame-001',
      lotNo: 'LOT-20260521-001',
      status: 'ACTIVE',
    },
    update: {},
  })

  // SF-SHAFT-001 전용 Lot — itemId 를 반드시 item-semi-shaft-001 로 고정
  await prisma.lot.upsert({
    where: { tenantId_lotNo: { tenantId: IDS.tenant, lotNo: 'LOT-SHAFT-20260524-001' } },
    create: {
      id: 'lot-shaft-20260524-001',
      tenantId: IDS.tenant,
      itemId: 'item-semi-shaft-001',
      lotNo: 'LOT-SHAFT-20260524-001',
      status: 'ACTIVE',
    },
    update: {},
  })

  // ── Phase 2-D-1: LOT 미지정 데드재고 cleanup 을 위한 시작 LOT 추가 ─────────
  // RM-STEEL-001, RM-ALUM-001, SF-FRAME-001(WH-SEMI 별도), FG-ASSY-001 에 대해
  // demo 환경의 초기 보유 재고를 표현할 시작 LOT 를 생성한다.
  // seedInventoryBalances Part 2 에서 이 LOT 들에 lotId 가 연결된 재고 row 를 생성한다.
  const startLots: Array<{ id: string; itemId: string; lotNo: string }> = [
    { id: 'lot-steel-20260301-001', itemId: 'item-raw-steel-001',  lotNo: 'LOT-STEEL-20260301-001' },
    { id: 'lot-alum-20260301-001',  itemId: 'item-raw-alum-001',   lotNo: 'LOT-ALUM-20260301-001'  },
    { id: 'lot-frame-20260301-001-semi', itemId: 'item-semi-frame-001', lotNo: 'LOT-FRAME-20260301-001' },
    { id: 'lot-fg-20260301-001',    itemId: 'item-fg-assy-001',    lotNo: 'LOT-FG-20260301-001'    },
  ]
  for (const l of startLots) {
    await prisma.lot.upsert({
      where: { tenantId_lotNo: { tenantId: IDS.tenant, lotNo: l.lotNo } },
      create: {
        id: l.id,
        tenantId: IDS.tenant,
        itemId: l.itemId,
        lotNo: l.lotNo,
        status: 'ACTIVE',
      },
      update: {},
    })
  }
}

async function seedInventoryBalances() {
  // ── 1. lotId=null 기준 재고 (비 LOT 품목 한정) ─────────────────────────────
  // Phase 2-D-1 이후 정책: isLotTracked=true 품목은 lotId=null 재고로 절대
  // 생성하지 않는다 (출고/출하 불가 데드재고가 되기 때문). LOT 관리 품목의
  // 시작 재고는 seedLots() 의 시작 LOT 와 함께 Part 2 에서 lotId 가 연결된
  // 형태로 생성한다.
  const balances = [
    // 원자재 창고 — 비LOT 품목만
    { itemId: 'item-raw-bolt-001',  warehouseId: 'wh-raw-001', qtyOnHand: 2000, qtyAvailable: 2000 },
    { itemId: 'item-cons-oil-001',  warehouseId: 'wh-raw-001', qtyOnHand: 100,  qtyAvailable: 100  },
  ]

  for (const b of balances) {
    const existingBalance = await prisma.inventoryBalance.findFirst({
      where: {
        tenantId: IDS.tenant,
        itemId: b.itemId,
        warehouseId: b.warehouseId,
        lotId: null,
      },
    })

    if (existingBalance) {
      await prisma.inventoryBalance.update({
        where: { id: existingBalance.id },
        data: {},
      })
    } else {
      await prisma.inventoryBalance.create({
        data: {
          tenantId: IDS.tenant,
          siteId: IDS.sites.factory,
          itemId: b.itemId,
          warehouseId: b.warehouseId,
          qtyOnHand: b.qtyOnHand,
          qtyAvailable: b.qtyAvailable,
          qtyHold: 0,
        },
      })
    }
  }

  // ── 2. LOT 연결 재고 (getLotStockByItems 대상: lotId != null) ─────────────
  // seedLots() 에서 생성한 Lot을 lotNo 기준으로 조회하여 lotId를 동적 결정한다.
  // SF-FRAME-001: UI 자재입고로 생성된 wh-raw-001 row(LOT-20260521-001, qty=499)가
  //   이미 정상 존재하므로 seed 에서 추가 row 를 만들지 않는다(중복 드롭다운 방지).
  // SF-SHAFT-001: 전용 lotNo(LOT-SHAFT-20260524-001)로 생성한 Lot 을 반제품 창고에 연결.
  const lotBalances: Array<{
    lotNo: string
    itemId: string
    warehouseId: string
    qtyOnHand: number
    qtyAvailable: number
  }> = [
    // SF-SHAFT-001 전용 LOT — 반제품 창고
    {
      lotNo: 'LOT-SHAFT-20260524-001',
      itemId: 'item-semi-shaft-001',
      warehouseId: 'wh-semi-001',
      qtyOnHand: 60,
      qtyAvailable: 60,
    },
    // Phase 2-D-1: LOT 관리 품목의 시작 재고 (lotId 연결)
    {
      lotNo: 'LOT-STEEL-20260301-001',
      itemId: 'item-raw-steel-001',
      warehouseId: 'wh-raw-001',
      qtyOnHand: 500,
      qtyAvailable: 500,
    },
    {
      lotNo: 'LOT-ALUM-20260301-001',
      itemId: 'item-raw-alum-001',
      warehouseId: 'wh-raw-001',
      qtyOnHand: 300,
      qtyAvailable: 300,
    },
    {
      lotNo: 'LOT-FRAME-20260301-001',
      itemId: 'item-semi-frame-001',
      warehouseId: 'wh-semi-001',
      qtyOnHand: 80,
      qtyAvailable: 80,
    },
    {
      lotNo: 'LOT-FG-20260301-001',
      itemId: 'item-fg-assy-001',
      warehouseId: 'wh-fg-001',
      qtyOnHand: 25,
      qtyAvailable: 25,
    },
  ]

  for (const b of lotBalances) {
    const lot = await prisma.lot.findUnique({
      where: { tenantId_lotNo: { tenantId: IDS.tenant, lotNo: b.lotNo } },
    })
    if (!lot) {
      console.warn(`  [seedInventoryBalances] Lot not found for lotNo=${b.lotNo}, skipping.`)
      continue
    }

    const existing = await prisma.inventoryBalance.findFirst({
      where: {
        tenantId: IDS.tenant,
        itemId: b.itemId,
        warehouseId: b.warehouseId,
        lotId: lot.id,
      },
    })

    if (!existing) {
      await prisma.inventoryBalance.create({
        data: {
          tenantId: IDS.tenant,
          siteId: IDS.sites.factory,
          itemId: b.itemId,
          warehouseId: b.warehouseId,
          lotId: lot.id,
          qtyOnHand: b.qtyOnHand,
          qtyAvailable: b.qtyAvailable,
          qtyHold: 0,
        },
      })
    }
  }

  // ── 3. 과거 seed 실행에서 생긴 불필요한 LOT 연결 row 정리 ────────────────────
  // 아래 두 row 는 이전 seed 실행 시 의도치 않게 생성된 잔재다.
  // 이후 seed 재실행에서도 멱등하게 정리되도록 deleteMany 로 처리한다.

  // SF-SHAFT-001 × LOT-20260521-002: Lot.itemId 가 item-semi-shaft-001 이 아닌
  // 다른 품목을 가리키는 불일치 row — 삭제
  const staleShaftLot = await prisma.lot.findUnique({
    where: { tenantId_lotNo: { tenantId: IDS.tenant, lotNo: 'LOT-20260521-002' } },
  })
  if (staleShaftLot && staleShaftLot.itemId !== 'item-semi-shaft-001') {
    await prisma.inventoryBalance.deleteMany({
      where: {
        tenantId: IDS.tenant,
        itemId: 'item-semi-shaft-001',
        lotId: staleShaftLot.id,
      },
    })
  }

  // SF-FRAME-001 × wh-semi-001 lotId row: 이전 seed 가 중복 추가한 row — 삭제
  // wh-raw-001 의 기존 정상 row(LOT-20260521-001, qty=499)만 남긴다.
  const frameLot = await prisma.lot.findUnique({
    where: { tenantId_lotNo: { tenantId: IDS.tenant, lotNo: 'LOT-20260521-001' } },
  })
  if (frameLot) {
    await prisma.inventoryBalance.deleteMany({
      where: {
        tenantId: IDS.tenant,
        itemId: 'item-semi-frame-001',
        warehouseId: 'wh-semi-001',
        lotId: frameLot.id,
      },
    })
  }

  // ── Phase 2-D-1 cleanup ────────────────────────────────────────────────────
  // 모든 삭제는 tenantId = IDS.tenant 가드. 운영/타 tenant 데이터에는 영향 없음.

  // 4-3. 더미 Item ( itemCode: 123/456/abc/sdsd/test/CS-OIL-0013 ) 의
  //      InventoryBalance / InventoryTransaction 만 정리. Item 자체는 보존.
  const dummyItemCodes = ['123', '456', 'abc', 'sdsd', 'test', 'CS-OIL-0013']
  const dummyItems = await prisma.item.findMany({
    where: { tenantId: IDS.tenant, code: { in: dummyItemCodes } },
    select: { id: true },
  })
  const dummyItemIds = dummyItems.map((i) => i.id)
  if (dummyItemIds.length > 0) {
    await prisma.inventoryBalance.deleteMany({
      where: { tenantId: IDS.tenant, itemId: { in: dummyItemIds } },
    })
    await prisma.inventoryTransaction.deleteMany({
      where: { tenantId: IDS.tenant, itemId: { in: dummyItemIds } },
    })
  }

  // 4-2. SF-SHAFT-001 @ WH-RAW lotId=null row 삭제
  //      ─ 반제품(SF)이 원자재 창고(WH-RAW)에 lotId=null 로 들어와 있는 비정상 row
  //      ─ Q1 분석에서 qty=54940 로 확인됨
  await prisma.inventoryBalance.deleteMany({
    where: {
      tenantId: IDS.tenant,
      itemId: 'item-semi-shaft-001',
      warehouseId: 'wh-raw-001',
      lotId: null,
    },
  })

  // 4-1. isLotTracked=true 인데 lotId IS NULL 인 InventoryBalance 잔재 일괄 삭제
  //      ─ demo tenant 한정. 비LOT 품목의 lotId=null 재고는 보호된다.
  const lotTrackedItems = await prisma.item.findMany({
    where: { tenantId: IDS.tenant, isLotTracked: true },
    select: { id: true },
  })
  const lotTrackedItemIds = lotTrackedItems.map((i) => i.id)
  if (lotTrackedItemIds.length > 0) {
    await prisma.inventoryBalance.deleteMany({
      where: {
        tenantId: IDS.tenant,
        itemId: { in: lotTrackedItemIds },
        lotId: null,
      },
    })
  }
}

async function seedMedicalTraceabilityDemoV2(mode: SeedMode) {
  const fgItemId = 'item-fg-assy-001'
  const steelItemId = 'item-raw-steel-001'
  const alumItemId = 'item-raw-alum-001'
  const inspectionSpecId = 'ispec-med-fg-ins-001'
  const scenarios = [
    {
      key: 'normal',
      workOrderId: 'wo-demo-normal-001',
      orderNo: 'WO-DEMO-NORMAL-001',
      manufacturingNo: 'MFG-DEMO-NORMAL-001',
      rootId: 'wip-demo-normal-root-001',
      rootQty: 10,
      fgLotId: 'lot-demo-fg-normal-001',
      fgLotNo: 'LOT-DEMO-FG-NORMAL-001',
      receiptQty: 10,
    },
    {
      key: 'scrap',
      workOrderId: 'wo-demo-scrap-001',
      orderNo: 'WO-DEMO-SCRAP-001',
      manufacturingNo: 'MFG-DEMO-SCRAP-001',
      rootId: 'wip-demo-scrap-root-001',
      rootQty: 8,
      fgLotId: 'lot-demo-fg-scrap-001',
      fgLotNo: 'LOT-DEMO-FG-SCRAP-001',
      receiptQty: 8,
    },
    {
      key: 'rework-final',
      workOrderId: 'wo-demo-rework-final-001',
      orderNo: 'WO-DEMO-REWORK-FINAL-001',
      manufacturingNo: 'MFG-DEMO-REWORK-FINAL-001',
      rootId: 'wip-demo-rework-final-root-001',
      rootQty: 9,
      fgLotId: 'lot-demo-fg-rework-final-001',
      fgLotNo: 'LOT-DEMO-FG-REWORK-FINAL-001',
      receiptQty: 9,
    },
    {
      key: 'rework-mid',
      workOrderId: 'wo-demo-rework-mid-001',
      orderNo: 'WO-DEMO-REWORK-MID-001',
      manufacturingNo: 'MFG-DEMO-REWORK-MID-001',
      rootId: 'wip-demo-rework-mid-root-001',
      rootQty: 8,
      fgLotId: null,
      fgLotNo: null,
      receiptQty: 0,
    },
    {
      key: 'rework-legacy',
      workOrderId: 'wo-demo-rework-legacy-001',
      orderNo: 'WO-DEMO-REWORK-LEGACY-001',
      manufacturingNo: 'MFG-DEMO-REWORK-LEGACY-001',
      rootId: 'wip-demo-rework-legacy-root-001',
      rootQty: 10,
      fgLotId: null,
      fgLotNo: null,
      receiptQty: 0,
    },
  ] as const
  const operationTemplates = [
    { seq: 10, routingOperationId: 'rop-med-10', workCenterId: IDS.workCenters.machining },
    { seq: 20, routingOperationId: 'rop-med-20', workCenterId: IDS.workCenters.postProcess },
    { seq: 30, routingOperationId: 'rop-med-30', workCenterId: IDS.workCenters.inspection },
    { seq: 40, routingOperationId: 'rop-med-40', workCenterId: IDS.workCenters.packaging },
    { seq: 50, routingOperationId: 'rop-med-50', workCenterId: IDS.workCenters.finishedStore },
  ] as const
  const rawLots = [
    { id: 'lot-demo-rm-steel-001', lotNo: 'LOT-DEMO-RM-STEEL-001', itemId: steelItemId },
    { id: 'lot-demo-rm-alum-001', lotNo: 'LOT-DEMO-RM-ALUM-001', itemId: alumItemId },
  ] as const
  const baseAt = new Date('2026-05-18T09:00:00+09:00')
  const at = (days: number, hours = 0) =>
    new Date(baseAt.getTime() + days * 24 * 60 * 60 * 1000 + hours * 60 * 60 * 1000)
  const operationId = (key: string, seq: number) => `woo-demo-${key}-${seq}`
  const resultId = (key: string, seq: number) => `pr-demo-${key}-${seq}`

  await prisma.$transaction(async (tx) => {
    const existingWorkOrders = await tx.workOrder.findMany({
      where: {
        tenantId: IDS.tenant,
        OR: [
          { orderNo: { startsWith: 'WO-DEMO-' } },
          { manufacturingNo: { startsWith: 'MFG-DEMO-' } },
        ],
      },
      select: { id: true, operations: { select: { id: true } } },
    })
    const workOrderIds = existingWorkOrders.map((workOrder) => workOrder.id)
    const operationIds = existingWorkOrders.flatMap((workOrder) =>
      workOrder.operations.map((operation) => operation.id),
    )
    const shipmentItems = await tx.shipmentItem.findMany({
      where: {
        OR: [
          { shipmentOrder: { tenantId: IDS.tenant, shipmentNo: { startsWith: 'SH-DEMO-' } } },
          { salesOrderItem: { salesOrder: { tenantId: IDS.tenant, orderNo: { startsWith: 'SO-DEMO-' } } } },
        ],
      },
      select: { id: true },
    })
    const shipmentItemIds = shipmentItems.map((item) => item.id)
    const demoLots = await tx.lot.findMany({
      where: { tenantId: IDS.tenant, lotNo: { startsWith: 'LOT-DEMO-' } },
      select: { id: true },
    })
    const demoLotIds = demoLots.map((lot) => lot.id)

    if (workOrderIds.length > 0) {
      await tx.wipUnitMaterialLot.deleteMany({
        where: { wipUnit: { workOrderId: { in: workOrderIds } } },
      })
      await tx.wipMovement.deleteMany({
        where: { wipUnit: { workOrderId: { in: workOrderIds } } },
      })
      await tx.wipUnit.deleteMany({ where: { workOrderId: { in: workOrderIds } } })
      await tx.finishedGoodsReceipt.deleteMany({ where: { workOrderId: { in: workOrderIds } } })
      await tx.workOrderMaterialLot.deleteMany({ where: { workOrderId: { in: workOrderIds } } })
      if (operationIds.length > 0) {
        const inspections = await tx.qualityInspection.findMany({
          where: { workOrderOperationId: { in: operationIds } },
          select: { id: true },
        })
        const inspectionIds = inspections.map((inspection) => inspection.id)
        if (inspectionIds.length > 0) {
          await tx.defectRecord.deleteMany({ where: { qualityInspectionId: { in: inspectionIds } } })
        }
        await tx.qualityInspection.deleteMany({ where: { workOrderOperationId: { in: operationIds } } })
        await tx.productionResult.deleteMany({ where: { workOrderOperationId: { in: operationIds } } })
        await tx.workOrderOperation.deleteMany({ where: { id: { in: operationIds } } })
      }
      await tx.workOrder.deleteMany({ where: { id: { in: workOrderIds } } })
    }
    await tx.inventoryTransaction.deleteMany({
      where: {
        tenantId: IDS.tenant,
        OR: [
          { txNo: { startsWith: 'TX-DEMO-' } },
          ...(shipmentItemIds.length > 0
            ? [{ refType: 'SHIPMENT_ITEM', refId: { in: shipmentItemIds } }]
            : []),
        ],
      },
    })
    if (shipmentItemIds.length > 0) {
      await tx.shipmentItem.deleteMany({ where: { id: { in: shipmentItemIds } } })
    }
    await tx.shipmentOrder.deleteMany({
      where: {
        OR: [
          { tenantId: IDS.tenant, shipmentNo: { startsWith: 'SH-DEMO-' } },
          { salesOrder: { tenantId: IDS.tenant, orderNo: { startsWith: 'SO-DEMO-' } } },
        ],
      },
    })
    await tx.salesOrderItem.deleteMany({
      where: { salesOrder: { tenantId: IDS.tenant, orderNo: { startsWith: 'SO-DEMO-' } } },
    })
    await tx.salesOrder.deleteMany({
      where: { tenantId: IDS.tenant, orderNo: { startsWith: 'SO-DEMO-' } },
    })
    if (demoLotIds.length > 0) {
      await tx.inventoryBalance.deleteMany({
        where: { tenantId: IDS.tenant, lotId: { in: demoLotIds } },
      })
      await tx.lot.deleteMany({ where: { id: { in: demoLotIds } } })
    }

    if (mode !== 'demo') return

    for (const lot of rawLots) {
      await tx.lot.create({
        data: {
          id: lot.id,
          tenantId: IDS.tenant,
          itemId: lot.itemId,
          lotNo: lot.lotNo,
          status: LotStatus.ACTIVE,
          manufactureDate: at(-10),
        },
      })
    }
    for (const scenario of scenarios) {
      if (!scenario.fgLotId || !scenario.fgLotNo) continue
      await tx.lot.create({
        data: {
          id: scenario.fgLotId,
          tenantId: IDS.tenant,
          itemId: fgItemId,
          lotNo: scenario.fgLotNo,
          status: LotStatus.ACTIVE,
          manufactureDate: at(4),
        },
      })
    }
    await tx.inventoryTransaction.createMany({
      data: [
        {
          id: 'tx-demo-rm-receipt-steel-001',
          tenantId: IDS.tenant,
          itemId: steelItemId,
          lotId: rawLots[0].id,
          toLocationId: IDS.warehouses.rawMaterial,
          txNo: 'TX-DEMO-RM-RECEIPT-STEEL-001',
          txType: TransactionType.RECEIPT,
          qty: 100,
          refType: 'SEED_OPENING',
          refId: rawLots[0].id,
          note: 'Seed v2 원자재 LOT 시작 입고',
          txAt: at(-9),
        },
        {
          id: 'tx-demo-rm-receipt-alum-001',
          tenantId: IDS.tenant,
          itemId: alumItemId,
          lotId: rawLots[1].id,
          toLocationId: IDS.warehouses.rawMaterial,
          txNo: 'TX-DEMO-RM-RECEIPT-ALUM-001',
          txType: TransactionType.RECEIPT,
          qty: 50,
          refType: 'SEED_OPENING',
          refId: rawLots[1].id,
          note: 'Seed v2 원자재 LOT 시작 입고',
          txAt: at(-9),
        },
      ],
    })
    await tx.inventoryBalance.createMany({
      data: [
        {
          id: 'ib-demo-rm-steel-001',
          tenantId: IDS.tenant,
          siteId: IDS.sites.factory,
          itemId: steelItemId,
          lotId: rawLots[0].id,
          warehouseId: IDS.warehouses.rawMaterial,
          qtyOnHand: 90,
          qtyAvailable: 90,
          qtyHold: 0,
        },
        {
          id: 'ib-demo-rm-alum-001',
          tenantId: IDS.tenant,
          siteId: IDS.sites.factory,
          itemId: alumItemId,
          lotId: rawLots[1].id,
          warehouseId: IDS.warehouses.rawMaterial,
          qtyOnHand: 45,
          qtyAvailable: 45,
          qtyHold: 0,
        },
      ],
    })

    for (let index = 0; index < scenarios.length; index++) {
      const scenario = scenarios[index]
      const startedAt = at(index)
      const finalOperationId = operationId(scenario.key, 50)
      const inspectionOperationId = operationId(scenario.key, 30)
      const child =
        scenario.key === 'scrap'
          ? {
              id: 'wip-demo-scrap-child-001',
              sourceResultId: resultId(scenario.key, 30),
              operationId: inspectionOperationId,
              workCenterId: IDS.workCenters.inspection,
              qty: 2,
              status: WipUnitStatus.SCRAPPED,
            }
          : scenario.key === 'rework-final'
            ? {
                id: 'wip-demo-rework-final-child-001',
                sourceResultId: resultId(scenario.key, 50),
                operationId: finalOperationId,
                workCenterId: IDS.workCenters.finishedStore,
                qty: 3,
                status: WipUnitStatus.COMPLETED,
              }
            : scenario.key === 'rework-mid'
              ? {
                  id: 'wip-demo-rework-mid-child-001',
                  sourceResultId: resultId(scenario.key, 20),
                  operationId: operationId(scenario.key, 20),
                  workCenterId: IDS.workCenters.postProcess,
                  qty: 2,
                  status: WipUnitStatus.REWORK,
                }
              : null

      await tx.workOrder.create({
        data: {
          id: scenario.workOrderId,
          tenantId: IDS.tenant,
          siteId: IDS.sites.factory,
          itemId: fgItemId,
          bomId: 'bom-fg-assy-001',
          routingId: 'rtg-medical-std-001',
          orderNo: scenario.orderNo,
          manufacturingNo: scenario.manufacturingNo,
          plannedQty: 10,
          status: WorkOrderStatus.COMPLETED,
          dueDate: at(index + 7),
        },
      })
      for (const operation of operationTemplates) {
        const completedQty =
          scenario.key === 'scrap' && operation.seq >= 40
            ? 8
            : scenario.key === 'rework-mid' && operation.seq >= 30
              ? 8
              : 10
        const defectQty = scenario.key === 'scrap' && operation.seq === 30 ? 2 : 0
        const reworkQty =
          scenario.key === 'rework-final' && operation.seq === 50
            ? 3
            : (scenario.key === 'rework-mid' && operation.seq === 20) ||
                (scenario.key === 'rework-legacy' && operation.seq === 50)
              ? 2
              : 0
        await tx.workOrderOperation.create({
          data: {
            id: operationId(scenario.key, operation.seq),
            workOrderId: scenario.workOrderId,
            routingOperationId: operation.routingOperationId,
            seq: operation.seq,
            status: OperationStatus.COMPLETED,
            plannedQty: 10,
            completedQty,
          },
        })
        await tx.productionResult.create({
          data: {
            id: resultId(scenario.key, operation.seq),
            workOrderOperationId: operationId(scenario.key, operation.seq),
            goodQty: completedQty - defectQty - reworkQty,
            defectQty,
            reworkQty,
            startedAt: new Date(startedAt.getTime() + operation.seq * 60 * 1000),
            endedAt: new Date(startedAt.getTime() + (operation.seq + 30) * 60 * 1000),
          },
        })
      }

      const steelTxId = `tx-demo-${scenario.key}-issue-steel-001`
      const alumTxId = `tx-demo-${scenario.key}-issue-alum-001`
      await tx.inventoryTransaction.createMany({
        data: [
          {
            id: steelTxId,
            tenantId: IDS.tenant,
            itemId: steelItemId,
            lotId: rawLots[0].id,
            fromLocationId: IDS.warehouses.rawMaterial,
            txNo: `TX-DEMO-${scenario.key.toUpperCase()}-ISSUE-STEEL-001`,
            txType: TransactionType.ISSUE,
            qty: 2,
            refType: 'WORK_ORDER',
            refId: scenario.workOrderId,
            note: 'Seed v2 제조 투입 LOT 출고',
            txAt: startedAt,
          },
          {
            id: alumTxId,
            tenantId: IDS.tenant,
            itemId: alumItemId,
            lotId: rawLots[1].id,
            fromLocationId: IDS.warehouses.rawMaterial,
            txNo: `TX-DEMO-${scenario.key.toUpperCase()}-ISSUE-ALUM-001`,
            txType: TransactionType.ISSUE,
            qty: 1,
            refType: 'WORK_ORDER',
            refId: scenario.workOrderId,
            note: 'Seed v2 제조 투입 LOT 출고',
            txAt: startedAt,
          },
        ],
      })
      const steelMaterialLotId = `woml-demo-${scenario.key}-steel-001`
      const alumMaterialLotId = `woml-demo-${scenario.key}-alum-001`
      await tx.workOrderMaterialLot.createMany({
        data: [
          {
            id: steelMaterialLotId,
            tenantId: IDS.tenant,
            workOrderId: scenario.workOrderId,
            manufacturingNo: scenario.manufacturingNo,
            materialItemId: steelItemId,
            materialLotNo: rawLots[0].lotNo,
            qty: 2,
            unit: 'KG',
            issuedAt: startedAt,
            inventoryTransactionId: steelTxId,
          },
          {
            id: alumMaterialLotId,
            tenantId: IDS.tenant,
            workOrderId: scenario.workOrderId,
            manufacturingNo: scenario.manufacturingNo,
            materialItemId: alumItemId,
            materialLotNo: rawLots[1].lotNo,
            qty: 1,
            unit: 'KG',
            issuedAt: startedAt,
            inventoryTransactionId: alumTxId,
          },
        ],
      })
      await tx.wipUnit.create({
        data: {
          id: scenario.rootId,
          tenantId: IDS.tenant,
          siteId: IDS.sites.factory,
          workOrderId: scenario.workOrderId,
          workOrderOperationId: finalOperationId,
          itemId: fgItemId,
          lotId: scenario.fgLotId,
          manufacturingNo: scenario.manufacturingNo,
          currentWorkCenterId: IDS.workCenters.finishedStore,
          qty: scenario.rootQty,
          status: WipUnitStatus.COMPLETED,
          createdAt: startedAt,
        },
      })
      if (child) {
        await tx.wipUnit.create({
          data: {
            id: child.id,
            tenantId: IDS.tenant,
            siteId: IDS.sites.factory,
            workOrderId: scenario.workOrderId,
            workOrderOperationId: child.operationId,
            itemId: fgItemId,
            manufacturingNo: scenario.manufacturingNo,
            currentWorkCenterId: child.workCenterId,
            sourceProductionResultId: child.sourceResultId,
            parentWipUnitId: scenario.rootId,
            qty: child.qty,
            status: child.status,
            createdAt: startedAt,
          },
        })
      }
      await tx.wipUnitMaterialLot.createMany({
        data: [
          {
            id: `wuml-demo-${scenario.key}-steel-001`,
            tenantId: IDS.tenant,
            wipUnitId: scenario.rootId,
            workOrderMaterialLotId: steelMaterialLotId,
            materialItemId: steelItemId,
            materialLotId: rawLots[0].id,
            materialLotNo: rawLots[0].lotNo,
            qty: 2,
            unit: 'KG',
            linkedAt: startedAt,
          },
          {
            id: `wuml-demo-${scenario.key}-alum-001`,
            tenantId: IDS.tenant,
            wipUnitId: scenario.rootId,
            workOrderMaterialLotId: alumMaterialLotId,
            materialItemId: alumItemId,
            materialLotId: rawLots[1].id,
            materialLotNo: rawLots[1].lotNo,
            qty: 1,
            unit: 'KG',
            linkedAt: startedAt,
          },
        ],
      })

      const afterPostQty = scenario.key === 'rework-mid' ? 8 : 10
      const afterInspectionQty = scenario.key === 'scrap' ? 8 : afterPostQty
      await tx.wipMovement.createMany({
        data: [
          {
            id: `wm-demo-${scenario.key}-created-001`,
            tenantId: IDS.tenant,
            siteId: IDS.sites.factory,
            wipUnitId: scenario.rootId,
            movementType: WipMovementType.CREATED,
            toOperationId: operationId(scenario.key, 10),
            toWorkCenterId: IDS.workCenters.machining,
            qty: 10,
            sourceType: 'MATERIAL_ISSUE',
            sourceId: steelTxId,
            note: '자재출고로 WIP 생성',
            createdAt: new Date(startedAt.getTime() + 5 * 60 * 1000),
          },
          {
            id: `wm-demo-${scenario.key}-started-001`,
            tenantId: IDS.tenant,
            siteId: IDS.sites.factory,
            wipUnitId: scenario.rootId,
            movementType: WipMovementType.STARTED,
            toOperationId: operationId(scenario.key, 10),
            toWorkCenterId: IDS.workCenters.machining,
            qty: 10,
            sourceType: 'WorkOrderOperation',
            sourceId: operationId(scenario.key, 10),
            note: 'POP 작업시작',
            createdAt: new Date(startedAt.getTime() + 10 * 60 * 1000),
          },
          {
            id: `wm-demo-${scenario.key}-moved-10-20`,
            tenantId: IDS.tenant,
            siteId: IDS.sites.factory,
            wipUnitId: scenario.rootId,
            movementType: WipMovementType.MOVED,
            fromOperationId: operationId(scenario.key, 10),
            toOperationId: operationId(scenario.key, 20),
            fromWorkCenterId: IDS.workCenters.machining,
            toWorkCenterId: IDS.workCenters.postProcess,
            qty: 10,
            sourceType: 'ProductionResult',
            sourceId: resultId(scenario.key, 10),
            note: '공정 완료에 따른 이동',
            createdAt: new Date(startedAt.getTime() + 60 * 60 * 1000),
          },
          {
            id: `wm-demo-${scenario.key}-moved-20-30`,
            tenantId: IDS.tenant,
            siteId: IDS.sites.factory,
            wipUnitId: scenario.rootId,
            movementType: WipMovementType.MOVED,
            fromOperationId: operationId(scenario.key, 20),
            toOperationId: operationId(scenario.key, 30),
            fromWorkCenterId: IDS.workCenters.postProcess,
            toWorkCenterId: IDS.workCenters.inspection,
            qty: afterPostQty,
            sourceType: 'ProductionResult',
            sourceId: resultId(scenario.key, 20),
            note: '공정 완료에 따른 이동',
            createdAt: new Date(startedAt.getTime() + 2 * 60 * 60 * 1000),
          },
          {
            id: `wm-demo-${scenario.key}-moved-30-40`,
            tenantId: IDS.tenant,
            siteId: IDS.sites.factory,
            wipUnitId: scenario.rootId,
            movementType: WipMovementType.MOVED,
            fromOperationId: operationId(scenario.key, 30),
            toOperationId: operationId(scenario.key, 40),
            fromWorkCenterId: IDS.workCenters.inspection,
            toWorkCenterId: IDS.workCenters.packaging,
            qty: afterInspectionQty,
            sourceType: 'ProductionResult',
            sourceId: resultId(scenario.key, 30),
            note: '공정 완료에 따른 이동',
            createdAt: new Date(startedAt.getTime() + 3 * 60 * 60 * 1000),
          },
          {
            id: `wm-demo-${scenario.key}-moved-40-50`,
            tenantId: IDS.tenant,
            siteId: IDS.sites.factory,
            wipUnitId: scenario.rootId,
            movementType: WipMovementType.MOVED,
            fromOperationId: operationId(scenario.key, 40),
            toOperationId: finalOperationId,
            fromWorkCenterId: IDS.workCenters.packaging,
            toWorkCenterId: IDS.workCenters.finishedStore,
            qty: afterInspectionQty,
            sourceType: 'ProductionResult',
            sourceId: resultId(scenario.key, 40),
            note: '공정 완료에 따른 이동',
            createdAt: new Date(startedAt.getTime() + 4 * 60 * 60 * 1000),
          },
        ],
      })
      if (scenario.key === 'scrap' && child) {
        await tx.wipMovement.createMany({
          data: [
            {
              id: 'wm-demo-scrap-defect-001',
              tenantId: IDS.tenant,
              siteId: IDS.sites.factory,
              wipUnitId: scenario.rootId,
              movementType: WipMovementType.DEFECT,
              fromOperationId: inspectionOperationId,
              toOperationId: inspectionOperationId,
              fromWorkCenterId: IDS.workCenters.inspection,
              toWorkCenterId: IDS.workCenters.inspection,
              qty: 2,
              sourceType: 'ProductionResult',
              sourceId: child.sourceResultId,
              note: 'POP 실적 등록 불량 수량 기록 (defectQty=2)',
              createdAt: new Date(startedAt.getTime() + 140 * 60 * 1000),
            },
            {
              id: 'wm-demo-scrap-split-001',
              tenantId: IDS.tenant,
              siteId: IDS.sites.factory,
              wipUnitId: scenario.rootId,
              relatedWipUnitId: child.id,
              movementType: WipMovementType.SPLIT,
              fromOperationId: inspectionOperationId,
              toOperationId: inspectionOperationId,
              fromWorkCenterId: IDS.workCenters.inspection,
              toWorkCenterId: IDS.workCenters.inspection,
              qty: 2,
              sourceType: 'ProductionResult',
              sourceId: child.sourceResultId,
              note: 'POP 불량 수량 SCRAP 분리 (defectQty=2)',
              createdAt: new Date(startedAt.getTime() + 141 * 60 * 1000),
            },
            {
              id: 'wm-demo-scrap-dispose-001',
              tenantId: IDS.tenant,
              siteId: IDS.sites.factory,
              wipUnitId: child.id,
              relatedWipUnitId: scenario.rootId,
              movementType: WipMovementType.SCRAP,
              fromOperationId: inspectionOperationId,
              toOperationId: inspectionOperationId,
              fromWorkCenterId: IDS.workCenters.inspection,
              toWorkCenterId: IDS.workCenters.inspection,
              qty: 2,
              sourceType: 'ProductionResult',
              sourceId: child.sourceResultId,
              note: 'POP 불량 수량 자동 폐기 처리 (defectQty=2)',
              createdAt: new Date(startedAt.getTime() + 142 * 60 * 1000),
            },
          ],
        })
      }
      if ((scenario.key === 'rework-final' || scenario.key === 'rework-mid') && child) {
        const reworkMovementMinute = scenario.key === 'rework-mid' ? 115 : 245
        await tx.wipMovement.createMany({
          data: [
            {
              id: `wm-demo-${scenario.key}-rework-001`,
              tenantId: IDS.tenant,
              siteId: IDS.sites.factory,
              wipUnitId: scenario.rootId,
              relatedWipUnitId: child.id,
              movementType: WipMovementType.REWORK,
              fromOperationId: child.operationId,
              toOperationId: child.operationId,
              fromWorkCenterId: child.workCenterId,
              toWorkCenterId: child.workCenterId,
              qty: child.qty,
              sourceType: 'ProductionResult',
              sourceId: child.sourceResultId,
              note: `POP 실적 등록 재작업 수량 기록 (reworkQty=${child.qty})`,
              createdAt: new Date(startedAt.getTime() + reworkMovementMinute * 60 * 1000),
            },
            {
              id: `wm-demo-${scenario.key}-split-001`,
              tenantId: IDS.tenant,
              siteId: IDS.sites.factory,
              wipUnitId: scenario.rootId,
              relatedWipUnitId: child.id,
              movementType: WipMovementType.SPLIT,
              fromOperationId: child.operationId,
              toOperationId: child.operationId,
              fromWorkCenterId: child.workCenterId,
              toWorkCenterId: child.workCenterId,
              qty: child.qty,
              sourceType: 'ProductionResult',
              sourceId: child.sourceResultId,
              note: `POP 재작업 수량 분리 (reworkQty=${child.qty})`,
              createdAt: new Date(startedAt.getTime() + (reworkMovementMinute + 1) * 60 * 1000),
            },
          ],
        })
      }
      if (scenario.key === 'rework-legacy') {
        await tx.wipMovement.create({
          data: {
            id: 'wm-demo-rework-legacy-rework-001',
            tenantId: IDS.tenant,
            siteId: IDS.sites.factory,
            wipUnitId: scenario.rootId,
            movementType: WipMovementType.REWORK,
            fromOperationId: finalOperationId,
            toOperationId: finalOperationId,
            fromWorkCenterId: IDS.workCenters.finishedStore,
            toWorkCenterId: IDS.workCenters.finishedStore,
            qty: 2,
            sourceType: 'ProductionResult',
            sourceId: resultId(scenario.key, 50),
            note: '레거시 재작업 이력 (연결된 REWORK child 없음)',
            createdAt: new Date(startedAt.getTime() + 245 * 60 * 1000),
          },
        })
      }
      const completionQty =
        scenario.key === 'rework-final' ? 7 : scenario.key === 'rework-legacy' ? 10 : scenario.rootQty
      await tx.wipMovement.create({
        data: {
          id: `wm-demo-${scenario.key}-completed-001`,
          tenantId: IDS.tenant,
          siteId: IDS.sites.factory,
          wipUnitId: scenario.rootId,
          movementType: WipMovementType.COMPLETED,
          fromOperationId: finalOperationId,
          fromWorkCenterId: IDS.workCenters.finishedStore,
          qty: completionQty,
          sourceType: 'ProductionResult',
          sourceId: resultId(scenario.key, 50),
          note: '마지막 공정 완료',
          createdAt: new Date(startedAt.getTime() + 5 * 60 * 60 * 1000),
        },
      })
      if (scenario.key === 'rework-final' && child) {
        await tx.wipMovement.createMany({
          data: [
            {
              id: 'wm-demo-rework-final-merge-001',
              tenantId: IDS.tenant,
              siteId: IDS.sites.factory,
              wipUnitId: scenario.rootId,
              relatedWipUnitId: child.id,
              movementType: WipMovementType.MERGE,
              fromOperationId: finalOperationId,
              toOperationId: finalOperationId,
              fromWorkCenterId: IDS.workCenters.finishedStore,
              toWorkCenterId: IDS.workCenters.finishedStore,
              qty: 2,
              sourceType: 'ReworkCompletion',
              sourceId: child.id,
              note: '재작업 양품 복귀: 2',
              createdAt: new Date(startedAt.getTime() + 6 * 60 * 60 * 1000),
            },
            {
              id: 'wm-demo-rework-final-scrap-001',
              tenantId: IDS.tenant,
              siteId: IDS.sites.factory,
              wipUnitId: child.id,
              relatedWipUnitId: scenario.rootId,
              movementType: WipMovementType.SCRAP,
              fromOperationId: finalOperationId,
              toOperationId: finalOperationId,
              fromWorkCenterId: IDS.workCenters.finishedStore,
              toWorkCenterId: IDS.workCenters.finishedStore,
              qty: 1,
              sourceType: 'ReworkCompletion',
              sourceId: child.id,
              note: '재작업 후 폐기: 1',
              createdAt: new Date(startedAt.getTime() + 6 * 60 * 60 * 1000 + 60 * 1000),
            },
          ],
        })
      }
      if (scenario.key === 'normal' || scenario.key === 'scrap' || scenario.key === 'rework-final') {
        const inspectionId = `qi-demo-${scenario.key}-001`
        await tx.qualityInspection.create({
          data: {
            id: inspectionId,
            workOrderOperationId: inspectionOperationId,
            inspectionSpecId,
            inspectorId: IDS.profiles.manager,
            stage: InspectionStage.FINAL,
            result: scenario.key === 'scrap' ? InspectionResult.CONDITIONAL : InspectionResult.PASS,
            inspectedQty: scenario.key === 'scrap' ? 10 : scenario.rootQty,
            inspectedAt: new Date(startedAt.getTime() + 3 * 60 * 60 * 1000),
          },
        })
        if (scenario.key === 'scrap') {
          await tx.defectRecord.create({
            data: {
              id: 'dr-demo-scrap-001',
              qualityInspectionId: inspectionId,
              defectCodeId: IDS.defectCodes.vis01,
              qty: 2,
              severity: DefectSeverity.MAJOR,
              disposition: DefectDisposition.SCRAP,
            },
          })
        }
      }
      if (scenario.fgLotId && scenario.receiptQty > 0) {
        await tx.finishedGoodsReceipt.create({
          data: {
            id: `fgr-demo-${scenario.key}-001`,
            tenantId: IDS.tenant,
            siteId: IDS.sites.factory,
            workOrderId: scenario.workOrderId,
            itemId: fgItemId,
            lotId: scenario.fgLotId,
            warehouseId: IDS.warehouses.finished,
            locationId: IDS.locations.fgA,
            receiptQty: scenario.receiptQty,
            receiptAt: new Date(startedAt.getTime() + 7 * 60 * 60 * 1000),
          },
        })
        await tx.inventoryTransaction.create({
          data: {
            id: `tx-demo-${scenario.key}-fg-receipt-001`,
            tenantId: IDS.tenant,
            itemId: fgItemId,
            lotId: scenario.fgLotId,
            toLocationId: IDS.warehouses.finished,
            txNo: `TX-DEMO-${scenario.key.toUpperCase()}-FG-RECEIPT-001`,
            txType: TransactionType.RECEIPT,
            qty: scenario.receiptQty,
            refType: 'WORK_ORDER',
            refId: scenario.workOrderId,
            note: 'Seed v2 완제품 입고',
            txAt: new Date(startedAt.getTime() + 7 * 60 * 60 * 1000),
          },
        })
        await tx.inventoryBalance.create({
          data: {
            id: `ib-demo-${scenario.key}-fg-001`,
            tenantId: IDS.tenant,
            siteId: IDS.sites.factory,
            itemId: fgItemId,
            lotId: scenario.fgLotId,
            warehouseId: IDS.warehouses.finished,
            qtyOnHand: scenario.key === 'normal' ? 6 : scenario.receiptQty,
            qtyAvailable: scenario.key === 'normal' ? 6 : scenario.receiptQty,
            qtyHold: 0,
          },
        })
      }
    }

    const salesOrder = await tx.salesOrder.create({
      data: {
        id: 'so-demo-normal-001',
        tenantId: IDS.tenant,
        siteId: IDS.sites.factory,
        customerId: IDS.businessPartners.customer1,
        orderNo: 'SO-DEMO-NORMAL-001',
        orderDate: at(0),
        deliveryDate: at(8),
        status: SalesOrderStatus.PARTIAL_SHIPPED,
        currency: 'KRW',
        note: 'Seed v2 정상 제조번호 출하 검증 주문',
      },
    })
    const salesOrderItem = await tx.salesOrderItem.create({
      data: {
        id: 'soi-demo-normal-001',
        salesOrderId: salesOrder.id,
        itemId: fgItemId,
        qty: 10,
        unitPrice: 50000,
        producedQty: 10,
        shippedQty: 4,
      },
    })
    const shipment = await tx.shipmentOrder.create({
      data: {
        id: 'sh-demo-normal-001',
        tenantId: IDS.tenant,
        siteId: IDS.sites.factory,
        salesOrderId: salesOrder.id,
        shipmentNo: 'SH-DEMO-NORMAL-001',
        status: ShipmentStatus.SHIPPED,
        plannedDate: at(8),
        shippedDate: at(9),
        warehouseId: IDS.warehouses.finished,
        note: 'Seed v2 정상 LOT 출하 검증',
      },
    })
    const shipmentItem = await tx.shipmentItem.create({
      data: {
        id: 'shi-demo-normal-001',
        shipmentOrderId: shipment.id,
        salesOrderItemId: salesOrderItem.id,
        itemId: fgItemId,
        qty: 4,
        lotId: 'lot-demo-fg-normal-001',
      },
    })
    await tx.inventoryTransaction.create({
      data: {
        id: 'tx-demo-normal-fg-shipment-001',
        tenantId: IDS.tenant,
        itemId: fgItemId,
        lotId: 'lot-demo-fg-normal-001',
        fromLocationId: IDS.warehouses.finished,
        txNo: 'TX-DEMO-NORMAL-FG-ISSUE-001',
        txType: TransactionType.ISSUE,
        qty: 4,
        refType: 'SHIPMENT_ITEM',
        refId: shipmentItem.id,
        note: 'Seed v2 정상 완제품 출하',
        txAt: at(9),
      },
    })
  })

  if (mode !== 'demo') return

  const nullLotBalanceCount = await prisma.inventoryBalance.count({
    where: {
      tenantId: IDS.tenant,
      lotId: null,
      item: { isLotTracked: true },
    },
  })
  if (nullLotBalanceCount > 0) {
    throw new Error('Seed v2 검증 실패: LOT 추적 품목에 lotId=null 재고가 남아 있습니다.')
  }
  const demoBalances = await prisma.inventoryBalance.findMany({
    where: { tenantId: IDS.tenant, lot: { lotNo: { startsWith: 'LOT-DEMO-' } } },
    include: { lot: { select: { itemId: true, lotNo: true } } },
  })
  const mismatch = demoBalances.find(
    (balance) => balance.lot != null && balance.itemId !== balance.lot.itemId,
  )
  if (mismatch?.lot) {
    throw new Error(
      `Seed v2 검증 실패: InventoryBalance 품목과 LOT 품목이 다릅니다. lotNo=${mismatch.lot.lotNo}`,
    )
  }
}

async function seedECNs() {
  const existing = await prisma.engineeringChange.findFirst({
    where: { tenantId: IDS.tenant },
  });
  if (existing) return;

  await prisma.engineeringChange.create({
    data: {
      id: 'ecn-demo-001',
      tenantId: IDS.tenant,
      ecnNo: 'ECN-2026-001',
      title: '조립품 BOM 자재 수량 변경',
      reason: '설계 검토 결과 프레임 소요량 증가 필요',
      changeType: 'BOM',
      targetItemId: 'item-fg-assy-001',
      status: 'DRAFT',
      requestedBy: IDS.profiles.manager,
      note: '생산성 향상을 위한 자재 구성 최적화',
      details: {
        create: [
          {
            changeTarget: 'BOM_ITEM',
            actionType: 'MODIFY',
            description: '프레임 소요량 1 → 2로 변경',
            beforeValue: { componentItemId: 'item-semi-frame-001', qtyPer: 1 },
            afterValue: { componentItemId: 'item-semi-frame-001', qtyPer: 2 },
          },
        ],
      },
    },
  });
}

main()
  .catch((e) => {
    console.error('시드 실패:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
