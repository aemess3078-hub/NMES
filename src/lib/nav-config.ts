import type { NavItem } from '@/types/menu';

export const MES_NAV: NavItem[] = [
  // ═══════════════════════════════════════════════════════════════
  // MES
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'section-mes',
    parentId: null,
    label: 'MES',
    icon: 'Factory',
    displayOrder: 1,
    children: [
      // 1. 기준정보관리
      {
        id: 'nav-master',
        parentId: 'section-mes',
        label: '기준정보관리',
        icon: 'Database',
        displayOrder: 10,
        children: [
          { id: 'nav-items', parentId: 'nav-master', label: '품목정보', icon: 'Package', href: '/app/mes/items', displayOrder: 1, children: [] },
          { id: 'nav-item-categories', parentId: 'nav-master', label: '품목분류관리', icon: 'Tags', href: '/app/mes/master/item-categories', displayOrder: 2, children: [] },
          { id: 'nav-item-groups', parentId: 'nav-master', label: '품목군관리', icon: 'Layers', href: '/app/mes/master/item-groups', displayOrder: 3, children: [] },
          { id: 'nav-bom', parentId: 'nav-master', label: 'BOM', icon: 'GitBranch', href: '/app/mes/bom', displayOrder: 3.5, children: [] },
          // 기준정보 영역의 설비 마스터만 '설비정보'로 정본화한다 — LMS 대메뉴(section-lms)의 '설비관리'는 별개이며 유지한다.
          { id: 'nav-equipment-master', parentId: 'nav-master', label: '설비정보', icon: 'Cog', href: '/app/mes/master/equipment', displayOrder: 4, children: [] },
          { id: 'nav-defects', parentId: 'nav-master', label: '불량관리', icon: 'AlertTriangle', href: '/app/mes/defects', displayOrder: 5, children: [] },
          { id: 'nav-routing', parentId: 'nav-master', label: '공정라우팅관리', icon: 'Workflow', href: '/app/mes/routing', displayOrder: 6, children: [] },
          { id: 'nav-work-centers', parentId: 'nav-master', label: '공정관리', icon: 'GitBranch', href: '/app/mes/work-centers', displayOrder: 7, children: [] },
          { id: 'nav-users', parentId: 'nav-master', label: '사용자관리', icon: 'Users', href: '/app/mes/users', displayOrder: 8, minRole: 'ADMIN', children: [] },
          { id: 'nav-sites', parentId: 'nav-master', label: '사업장관리', icon: 'Building2', href: '/app/mes/sites', displayOrder: 9, children: [] },
          { id: 'nav-locations', parentId: 'nav-master', label: '로케이션관리', icon: 'MapPin', href: '/app/mes/locations', displayOrder: 10, children: [] },
          { id: 'nav-customers', parentId: 'nav-master', label: '고객사 관리', icon: 'Building2', href: '/app/mes/customers', displayOrder: 11, children: [] },
          { id: 'nav-vendors', parentId: 'nav-master', label: '거래처 관리', icon: 'Handshake', href: '/app/mes/vendors', displayOrder: 11.5, children: [] },
          { id: 'nav-inspection-standards', parentId: 'nav-master', label: '검사표준관리', icon: 'FileCheck', href: '/app/mes/master/inspection-standards', displayOrder: 12, children: [] },
          // 금형관리 + 금형재고관리 → 금형/치공구관리 단일 메뉴 (미구현)
          { id: 'nav-mold-management', parentId: 'nav-master', label: '금형/치공구관리', icon: 'Wrench', href: '/app/mes/master/molds', displayOrder: 13, children: [] },
          { id: 'nav-downtime-reasons', parentId: 'nav-master', label: '비가동사유', icon: 'AlertTriangle', href: '/app/mes/master/downtime-reasons', displayOrder: 14, children: [] },
          // Gap Analysis Rev.2 계층 정렬: 사업계획서 기준정보관리 산하로 이동(기존 시스템관리 아래 있던 항목).
          // developerOnly는 원래 부모(nav-sysadmin)에서 상속되던 것이므로, 이동하면서 항목 자체에 명시해 보호를 그대로 유지한다.
          { id: 'nav-common-codes', parentId: 'nav-master', label: '코드관리', icon: 'BookOpen', href: '/app/mes/common-codes', displayOrder: 15, developerOnly: true, children: [] },
        ],
      },
      // 2. 생산관리
      {
        id: 'nav-production',
        parentId: 'section-mes',
        label: '생산관리',
        icon: 'Factory',
        displayOrder: 20,
        children: [
          { id: 'nav-prod-equip-output', parentId: 'nav-production', label: '설비별생산현황', icon: 'BarChart2', href: '/app/mes/production/equipment-output', displayOrder: 1, children: [] },
          { id: 'nav-prod-plan-output', parentId: 'nav-production', label: '생산계획', icon: 'CalendarDays', href: '/app/mes/production-plan', displayOrder: 2, children: [] },
          { id: 'nav-work-orders', parentId: 'nav-production', label: '작업지시', icon: 'ClipboardList', href: '/app/mes/work-orders', displayOrder: 3, children: [] },
          { id: 'nav-production-results', parentId: 'nav-production', label: '생산실적조회', icon: 'FileText', href: '/app/mes/production-results', displayOrder: 4, children: [] },
          { id: 'nav-finished-goods-receipt', parentId: 'nav-production', label: '완제품입고', icon: 'PackagePlus', href: '/app/mes/finished-goods-receipt', displayOrder: 4.5, children: [] },
          { id: 'nav-outsourcing', parentId: 'nav-production', label: '외주관리', icon: 'Truck', href: '/app/mes/production/outsourcing', displayOrder: 5, children: [] },
          // Gap Analysis Rev.2: 기존 route(/app/mes/rework)는 이미 동작 — nav 노출만 추가(업무로직 변경 없음)
          { id: 'nav-rework', parentId: 'nav-production', label: '재작업/보류관리', icon: 'RefreshCw', href: '/app/mes/rework', displayOrder: 5.5, children: [] },
          // Gap Analysis Rev.2 계층 정렬: 사업계획서 생산관리 산하로 이동(기존 시스템 > 추적성 아래 있던 항목). route/id 불변.
          { id: 'nav-traceability', parentId: 'nav-production', label: 'LOT 추적 조회', icon: 'Network', href: '/app/mes/traceability', displayOrder: 6, children: [] },
        ],
      },
      // 3. 재고관리 (NMES 기존 공통기능 — 재고현황은 자재관리로 이동, 나머지는 유지)
      {
        id: 'nav-inventory-section',
        parentId: 'section-mes',
        label: '재고관리',
        icon: 'Boxes',
        displayOrder: 30,
        children: [
          { id: 'nav-inventory-txns', parentId: 'nav-inventory-section', label: '전체입출고내역', icon: 'ArrowLeftRight', href: '/app/mes/inventory-transactions', displayOrder: 2, children: [] },
          { id: 'nav-wip-inventory', parentId: 'nav-inventory-section', label: '재공품재고', icon: 'RefreshCw', href: '/app/mes/production/wip-inventory', displayOrder: 3, children: [] },
        ],
      },
      // 4. 자재관리
      {
        id: 'nav-material',
        parentId: 'section-mes',
        label: '자재관리',
        icon: 'PackagePlus',
        displayOrder: 40,
        children: [
          { id: 'nav-purchase-orders', parentId: 'nav-material', label: '자재발주', icon: 'ShoppingCart', href: '/app/mes/purchase-orders', displayOrder: 1, children: [] },
          { id: 'nav-material-receipt', parentId: 'nav-material', label: '자재입고', icon: 'PackagePlus', href: '/app/mes/material-receipt', displayOrder: 2, children: [] },
          { id: 'nav-material-issue', parentId: 'nav-material', label: '자재출고', icon: 'FileInput', href: '/app/mes/material-issue', displayOrder: 3, children: [] },
          // 청운커팅 사업계획서 정본 '자재관리 > 반품관리' (PR #50)
          { id: 'nav-material-return', parentId: 'nav-material', label: '반품관리', icon: 'Undo2', href: '/app/mes/material-return', displayOrder: 3.4, children: [] },
          // Gap Analysis Rev.2 계층 정렬: 사업계획서 자재관리 산하로 이동(기존 재고관리 아래 있던 항목). route/id 불변.
          { id: 'nav-inventory', parentId: 'nav-material', label: '재고현황', icon: 'Package', href: '/app/mes/inventory', displayOrder: 3.5, children: [] },
          // 기존 NMES 공통기능 — 재고현황(정본)과 별개로 유지. 두 화면의 기능 중복 정리는 후속 업무분석 대상.
          { id: 'nav-material-stock', parentId: 'nav-material', label: '자재재고현황', icon: 'Boxes', href: '/app/mes/material/stock', displayOrder: 4, children: [] },
        ],
      },
      // 5. KPI — 7개 개별 메뉴 → KPI 대시보드 단일 메뉴 (미구현, comingSoon 유지)
      {
        id: 'nav-kpi',
        parentId: 'section-mes',
        label: 'KPI',
        icon: 'TrendingUp',
        displayOrder: 50,
        children: [
          { id: 'nav-kpi-dashboard', parentId: 'nav-kpi', label: 'KPI 대시보드', icon: 'LayoutDashboard', href: '/app/mes/kpi', displayOrder: 1, children: [] },
        ],
      },
      // 6. 품질검사
      {
        id: 'nav-quality',
        parentId: 'section-mes',
        label: '품질검사',
        icon: 'ShieldCheck',
        displayOrder: 60,
        children: [
          // 사업계획서 "품질현황" — 불량분석/원인분석/조치관리/재발방지관리를 종합한 대시보드.
          // 각 화면의 기존 계산식을 그대로 재사용하며 별도의 숫자 정의를 만들지 않는다.
          { id: 'nav-quality-dashboard', parentId: 'nav-quality', label: '품질현황', icon: 'LayoutDashboard', href: '/app/mes/quality/dashboard', displayOrder: 0.3, children: [] },
          { id: 'nav-defect-stats', parentId: 'nav-quality', label: '불량분석', icon: 'BarChart2', href: '/app/mes/quality/defect-stats', displayOrder: 1, children: [] },
          { id: 'nav-inspection-stages', parentId: 'nav-quality', label: '검사결과 관리', icon: 'ClipboardCheck', href: '/app/mes/inspection-stages', displayOrder: 2, children: [] },
          { id: 'nav-work-standards', parentId: 'nav-quality', label: '작업표준서관리', icon: 'BookOpen', href: '/app/mes/quality/work-standards', displayOrder: 3, children: [] },
          // 변경점정보등록 + 변경점정보LIST → 변경관리 단일 메뉴 (기존 ECN 구현 활용)
          { id: 'nav-change-management', parentId: 'nav-quality', label: '변경관리', icon: 'GitPullRequest', href: '/app/mes/ecn', displayOrder: 4, children: [] },
          // Gap Analysis Rev.2: 기존 route(/app/mes/inspection)는 이미 동작 — nav 노출만 추가(업무로직 변경 없음)
          { id: 'nav-inspection', parentId: 'nav-quality', label: '공정검사', icon: 'ClipboardList', href: '/app/mes/inspection', displayOrder: 0.5, children: [] },
          // PR #54: 사업계획서 "SPC 통계분석" — 기존 route(/app/mes/spc)의 placeholder를 실제 화면으로 교체
          { id: 'nav-spc', parentId: 'nav-quality', label: 'SPC 통계분석', icon: 'TrendingUp', href: '/app/mes/spc', displayOrder: 5, children: [] },
          // PR #55: 사업계획서 "원인분석" — DefectRecord 1건당 원인분석 등록/관리
          { id: 'nav-cause-analysis', parentId: 'nav-quality', label: '원인분석', icon: 'Search', href: '/app/mes/quality/cause-analysis', displayOrder: 6, children: [] },
          // 사업계획서 "조치관리" — DefectRecord 1건당 여러 건의 시정조치(담당자/기한/진행상태) 등록·관리.
          // 재발방지관리(효과성 검증/CAPA 종료판정)는 별도 메뉴/PR로 분리한다.
          { id: 'nav-corrective-action', parentId: 'nav-quality', label: '조치관리', icon: 'Wrench', href: '/app/mes/quality/corrective-action', displayOrder: 7, children: [] },
          // 사업계획서 "재발방지관리" — 불량→원인분석→조치관리 흐름의 마지막 단계.
          // 대책 수행과 효과성 검증(EFFECTIVE/INEFFECTIVE)을 구분해 CAPA 종료를 관리한다.
          { id: 'nav-recurrence-prevention', parentId: 'nav-quality', label: '재발방지관리', icon: 'ShieldAlert', href: '/app/mes/quality/recurrence-prevention', displayOrder: 8, children: [] },
        ],
      },
      // 7. 영업관리
      {
        id: 'nav-sales',
        parentId: 'section-mes',
        label: '영업관리',
        icon: 'TrendingUp',
        displayOrder: 70,
        children: [
          // Gap Analysis Rev.2: 사업계획서 정본 '수주관리'를 대표 라벨로 사용(수주등록 page h1과 이미 일치). 수주현황은 하위 상세 화면으로 유지.
          { id: 'nav-sales-orders', parentId: 'nav-sales', label: '수주관리', icon: 'ClipboardList', href: '/app/mes/sales-orders', displayOrder: 1, children: [] },
          { id: 'nav-sales-status', parentId: 'nav-sales', label: '수주현황', icon: 'BarChart2', href: '/app/mes/sales/order-status', displayOrder: 2, children: [] },
          // Gap Analysis Rev.2: 사업계획서 정본 '출하등록'을 대표 라벨로 사용. 납품현황은 하위 상세 화면으로 유지.
          { id: 'nav-shipments', parentId: 'nav-sales', label: '출하등록', icon: 'Truck', href: '/app/mes/shipments', displayOrder: 3, children: [] },
          { id: 'nav-delivery-status', parentId: 'nav-sales', label: '납품현황', icon: 'FileBarChart', href: '/app/mes/sales/delivery-status', displayOrder: 4, children: [] },
          // 청운커팅 사업계획서 정본 '영업관리 > 프로젝트 오더' (PR #47)
          { id: 'nav-project-orders', parentId: 'nav-sales', label: '프로젝트 오더', icon: 'FolderKanban', href: '/app/mes/project-orders', displayOrder: 5, children: [] },
          // 고객 추가기능 '영업관리 > 프로젝트 단가관리' (PR #52A) — 사업계획서 canonical
          // 메뉴 구조를 깨지 않도록 프로젝트 오더 바로 다음 자리에 추가한다.
          { id: 'nav-project-prices', parentId: 'nav-sales', label: '프로젝트 단가관리', icon: 'Banknote', href: '/app/mes/project-prices', displayOrder: 6, children: [] },
        ],
      },
      // 8. 프로젝트관리 (청운커팅 사업계획서 정본 신규 상위 그룹, PR #48)
      // 프로젝트 오더는 계속 영업관리에 남긴다 — 이 그룹으로 이동하지 않는다.
      {
        id: 'nav-project-management',
        parentId: 'section-mes',
        label: '프로젝트관리',
        icon: 'GanttChart',
        displayOrder: 80,
        children: [
          { id: 'nav-project-progress', parentId: 'nav-project-management', label: '프로젝트 진행현황', icon: 'GanttChart', href: '/app/mes/project-progress', displayOrder: 1, children: [] },
          // 청운커팅 사업계획서 정본 '프로젝트관리 > 이슈 관리' (PR #49)
          { id: 'nav-project-issues', parentId: 'nav-project-management', label: '이슈 관리', icon: 'CircleAlert', href: '/app/mes/project-issues', displayOrder: 2, children: [] },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 설비관리 (기존 LMS 상위 메뉴명 변경)
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'section-lms',
    parentId: null,
    label: '설비관리',
    icon: 'Cpu',
    displayOrder: 2,
    children: [
      // 1. 설비 모니터링 (설비현황은 대시보드로 이동, 분석모니터링은 그대로 유지)
      {
        id: 'nav-lms-monitoring',
        parentId: 'section-lms',
        label: '설비 모니터링',
        icon: 'Monitor',
        displayOrder: 10,
        children: [
          { id: 'nav-lms-analysis', parentId: 'nav-lms-monitoring', label: '분석모니터링', icon: 'Activity', href: '/app/mes/equipment-monitor', displayOrder: 1, children: [] },
        ],
      },
      // 2. 설비점검/수리 (기존 '설비관리' 하위 메뉴명 변경 — 중복 방지)
      {
        id: 'nav-lms-equipment',
        parentId: 'section-lms',
        label: '설비점검/수리',
        icon: 'Wrench',
        displayOrder: 20,
        children: [
          { id: 'nav-lms-errors', parentId: 'nav-lms-equipment', label: '에러보기', icon: 'AlertTriangle', href: '/app/lms/equipment/errors', displayOrder: 1, children: [] },
          { id: 'nav-lms-params', parentId: 'nav-lms-equipment', label: '파라미터보기', icon: 'Settings', href: '/app/lms/equipment/parameters', displayOrder: 2, children: [] },
          { id: 'nav-lms-repair-req', parentId: 'nav-lms-equipment', label: '설비수리관리', icon: 'Wrench', href: '/app/mes/equipment-repair', displayOrder: 3, children: [] },
          { id: 'nav-lms-problem-types', parentId: 'nav-lms-equipment', label: '설비문제유형등록', icon: 'AlertTriangle', href: '/app/mes/equipment-problems', displayOrder: 4, children: [] },
          { id: 'nav-lms-daily-check', parentId: 'nav-lms-equipment', label: '정기점검', icon: 'ClipboardCheck', href: '/app/mes/equipment-check', displayOrder: 5, children: [] },
          { id: 'nav-lms-check-status', parentId: 'nav-lms-equipment', label: '설비일상점검현황', icon: 'BarChart2', href: '/app/mes/equipment-check-status', displayOrder: 6, children: [] },
        ],
      },
      // 3. 공구관리 — 청운커팅 사업계획서 "설비관리 > 공구관리". 공구/치공구
      // 전용 신규 모델 대신 기존 Equipment(TOOL/JIG/FIXTURE)를 재사용하며,
      // 기준정보 CRUD 화면인 '금형/치공구관리'(기준정보 메뉴, /app/mes/master/molds)와는
      // 별개로 수명/사용이력까지 다루는 사업계획서 전용 화면이다.
      { id: 'nav-lms-tools', parentId: 'section-lms', label: '공구관리', icon: 'Package', href: '/app/mes/equipment-tools', displayOrder: 25, children: [] },
      // 4. 설비 통계분석
      {
        id: 'nav-lms-statistics',
        parentId: 'section-lms',
        label: '설비 통계분석',
        icon: 'FileBarChart',
        displayOrder: 30,
        children: [
          { id: 'nav-lms-stats-integrated', parentId: 'nav-lms-statistics', label: '통합통계', icon: 'BarChart2', href: '/app/mes/equipment-statistics', displayOrder: 1, children: [] },
          { id: 'nav-lms-stats-capacity', parentId: 'nav-lms-statistics', label: '능력', icon: 'Gauge', href: '/app/lms/statistics/capacity', displayOrder: 2, children: [] },
        ],
      },
      // 5. 설비연동 설정 (개발자 전용)
      {
        id: 'nav-lms-integration',
        parentId: 'section-lms',
        label: '설비연동 설정',
        icon: 'Cable',
        displayOrder: 40,
        developerOnly: true,
        children: [
          { id: 'nav-gateways', parentId: 'nav-lms-integration', label: 'Edge Gateway', icon: 'Wifi', href: '/app/mes/gateways', displayOrder: 1, children: [] },
          { id: 'nav-equipment-connections', parentId: 'nav-lms-integration', label: '설비 연결 설정', icon: 'Cable', href: '/app/mes/equipment-connections', displayOrder: 2, children: [] },
          { id: 'nav-tags', parentId: 'nav-lms-integration', label: '태그 사전', icon: 'Tag', href: '/app/mes/tags', displayOrder: 3, children: [] },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 대시보드 (사업계획서 정본 모듈 — 생산현황/설비현황을 기존 위치에서 이동)
  // 품질현황은 아직 구현된 기능이 없어 이번 PR에서 만들지 않는다.
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'section-dashboard',
    parentId: null,
    label: '대시보드',
    icon: 'LayoutDashboard',
    displayOrder: 2.5,
    children: [
      // NewMES 전용 화면(assertNewMesBrand()로 Server Action/Page 이중 보호됨, production-progress.actions.ts 참고).
      // nav-config.ts에는 브랜드 분기 자체가 없어(전체 파일 확인 결과 브랜드 조건 0건) 이 메뉴 항목 하나에만
      // 기존 NEXT_PUBLIC_BRAND 관례를 그대로 재사용해 조건부로 넣는다 — 새 NavItem 필드나 별도 브랜드 필터링
      // 체계를 nav-config/layout에 추가하지 않는다. (기존 생산관리 하위에서 이 조건부 항목을 그대로 이동)
      ...(process.env.NEXT_PUBLIC_BRAND === 'newmes'
        ? [{ id: 'nav-production-progress', parentId: 'section-dashboard', label: '생산현황', icon: 'Activity', href: '/app/mes/production-progress', displayOrder: 1, children: [] }]
        : []),
      // Gap Analysis Rev.2 계층 정렬: 기존 설비관리 > 설비 모니터링 아래 있던 항목을 이동. route/id 불변.
      { id: 'nav-lms-status', parentId: 'section-dashboard', label: '설비현황', icon: 'Monitor', href: '/app/lms/monitoring/status', displayOrder: 2, children: [] },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 시스템
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'section-system',
    parentId: null,
    label: '시스템',
    icon: 'Settings',
    displayOrder: 3,
    children: [
      {
        id: 'nav-sysadmin',
        parentId: 'section-system',
        label: '시스템관리',
        icon: 'Settings',
        displayOrder: 10,
        developerOnly: true,
        children: [
          { id: 'nav-features', parentId: 'nav-sysadmin', label: '기능 관리', icon: 'Puzzle', href: '/app/mes/features', displayOrder: 2, children: [] },
          { id: 'nav-lot-rules', parentId: 'nav-sysadmin', label: '번호 규칙', icon: 'Fingerprint', href: '/app/mes/lot-rules', displayOrder: 3, children: [] },
        ],
      },
      {
        id: 'nav-traceability-section',
        parentId: 'section-system',
        label: '추적성',
        icon: 'Search',
        displayOrder: 20,
        children: [
          { id: 'nav-lot', parentId: 'nav-traceability-section', label: 'LOT/Serial 관리', icon: 'Tag', href: '/app/mes/lot', displayOrder: 1, children: [] },
          { id: 'nav-manufacturing-traceability', parentId: 'nav-traceability-section', label: '제조번호 추적성', icon: 'Fingerprint', href: '/app/mes/manufacturing-traceability', displayOrder: 3, children: [] },
          // { id: 'nav-costing', parentId: 'nav-traceability-section', label: '원가분석', icon: 'Calculator', href: '/app/mes/costing', displayOrder: 4, children: [] },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // 요청/지원
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'section-support',
    parentId: null,
    label: '요청/지원',
    icon: 'LifeBuoy',
    displayOrder: 4,
    children: [
      {
        id: 'nav-support-requests',
        parentId: 'section-support',
        label: '요청사항',
        icon: 'ClipboardList',
        href: '/app/mes/support-requests',
        displayOrder: 1,
        children: [],
      },
    ],
  },
];
