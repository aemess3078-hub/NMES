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
          { id: 'nav-items', parentId: 'nav-master', label: '품목관리', icon: 'Package', href: '/app/mes/items', displayOrder: 1, children: [] },
          { id: 'nav-equipment-master', parentId: 'nav-master', label: '설비관리', icon: 'Cog', href: '/app/mes/master/equipment', displayOrder: 2, comingSoon: true, children: [] },
          { id: 'nav-defects', parentId: 'nav-master', label: '불량관리', icon: 'AlertTriangle', href: '/app/mes/defects', displayOrder: 3, children: [] },
          { id: 'nav-routing', parentId: 'nav-master', label: '라우팅관리', icon: 'Workflow', href: '/app/mes/routing', displayOrder: 4, children: [] },
          { id: 'nav-work-centers', parentId: 'nav-master', label: '공정관리', icon: 'GitBranch', href: '/app/mes/work-centers', displayOrder: 5, children: [] },
          { id: 'nav-users', parentId: 'nav-master', label: '사용자관리', icon: 'Users', href: '/app/mes/users', displayOrder: 6, children: [] },
          { id: 'nav-sites', parentId: 'nav-master', label: '사업장관리', icon: 'Building2', href: '/app/mes/sites', displayOrder: 7, children: [] },
          { id: 'nav-locations', parentId: 'nav-master', label: '로케이션관리', icon: 'MapPin', href: '/app/mes/locations', displayOrder: 8, children: [] },
          { id: 'nav-vendors', parentId: 'nav-master', label: '외주처관리', icon: 'Handshake', href: '/app/mes/vendors', displayOrder: 9, children: [] },
          { id: 'nav-inspection-standards', parentId: 'nav-master', label: '검사표준관리', icon: 'FileCheck', href: '/app/mes/master/inspection-standards', displayOrder: 10, comingSoon: true, children: [] },
          { id: 'nav-molds', parentId: 'nav-master', label: '금형관리', icon: 'Wrench', href: '/app/mes/master/molds', displayOrder: 11, comingSoon: true, children: [] },
          { id: 'nav-product-groups', parentId: 'nav-master', label: '제품군관리', icon: 'Boxes', href: '/app/mes/master/product-groups', displayOrder: 12, comingSoon: true, children: [] },
          { id: 'nav-downtime-reasons', parentId: 'nav-master', label: '비가동사유', icon: 'AlertTriangle', href: '/app/mes/master/downtime-reasons', displayOrder: 13, comingSoon: true, children: [] },
          { id: 'nav-mold-inventory', parentId: 'nav-master', label: '금형재고관리', icon: 'Package', href: '/app/mes/master/mold-inventory', displayOrder: 14, comingSoon: true, children: [] },
          { id: 'nav-item-categories', parentId: 'nav-master', label: '품목분류관리', icon: 'FolderOpen', href: '/app/mes/master/item-categories', displayOrder: 15, comingSoon: true, children: [] },
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
          { id: 'nav-prod-equip-output', parentId: 'nav-production', label: '설비별생산현황', icon: 'BarChart2', href: '/app/mes/production/equipment-output', displayOrder: 1, comingSoon: true, children: [] },
          { id: 'nav-prod-plan-output', parentId: 'nav-production', label: '생산계획별생산현황', icon: 'CalendarDays', href: '/app/mes/production-plan', displayOrder: 2, children: [] },
          { id: 'nav-work-orders', parentId: 'nav-production', label: '작업지시', icon: 'ClipboardList', href: '/app/mes/work-orders', displayOrder: 3, children: [] },
          { id: 'nav-production-results', parentId: 'nav-production', label: '작업일지', icon: 'FileText', href: '/app/mes/production-results', displayOrder: 4, children: [] },
          { id: 'nav-outsource-orders', parentId: 'nav-production', label: '외주발주등록', icon: 'Truck', href: '/app/mes/production/outsource-orders', displayOrder: 5, comingSoon: true, children: [] },
          { id: 'nav-outsource-receiving', parentId: 'nav-production', label: '외주입고등록', icon: 'PackagePlus', href: '/app/mes/production/outsource-receiving', displayOrder: 6, comingSoon: true, children: [] },
        ],
      },
      // 3. 재고관리
      {
        id: 'nav-inventory-section',
        parentId: 'section-mes',
        label: '재고관리',
        icon: 'Boxes',
        displayOrder: 30,
        children: [
          { id: 'nav-inventory', parentId: 'nav-inventory-section', label: '재고현황', icon: 'Package', href: '/app/mes/inventory', displayOrder: 1, children: [] },
          { id: 'nav-inventory-txns', parentId: 'nav-inventory-section', label: '전체입출고내역', icon: 'ArrowLeftRight', href: '/app/mes/inventory-transactions', displayOrder: 2, children: [] },
          { id: 'nav-wip-inventory', parentId: 'nav-inventory-section', label: '재공품재고', icon: 'RefreshCw', href: '/app/mes/production/wip-inventory', displayOrder: 3, comingSoon: true, children: [] },
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
          { id: 'nav-purchase-orders', parentId: 'nav-material', label: '자재발주현황', icon: 'ShoppingCart', href: '/app/mes/purchase-orders', displayOrder: 1, children: [] },
          { id: 'nav-material-receipt', parentId: 'nav-material', label: '자재입고현황', icon: 'PackagePlus', href: '/app/mes/material-receipt', displayOrder: 2, children: [] },
          { id: 'nav-material-issue', parentId: 'nav-material', label: '자재출고현황', icon: 'FileInput', href: '/app/mes/material-issue', displayOrder: 3, children: [] },
          { id: 'nav-material-stock', parentId: 'nav-material', label: '자재재고현황', icon: 'Boxes', href: '/app/mes/material/stock', displayOrder: 4, children: [] },
        ],
      },
      // 5. KPI
      {
        id: 'nav-kpi',
        parentId: 'section-mes',
        label: 'KPI',
        icon: 'TrendingUp',
        displayOrder: 50,
        children: [
          { id: 'nav-kpi-lead-time', parentId: 'nav-kpi', label: '제조리드타임 (P)', icon: 'Activity', href: '/app/mes/kpi/lead-time', displayOrder: 1, comingSoon: true, children: [] },
          { id: 'nav-kpi-defect-rate', parentId: 'nav-kpi', label: '품질불량률 (Q)', icon: 'AlertTriangle', href: '/app/mes/kpi/defect-rate', displayOrder: 2, comingSoon: true, children: [] },
          { id: 'nav-kpi-labor', parentId: 'nav-kpi', label: '작업공수 (C)', icon: 'Users', href: '/app/mes/kpi/labor-cost', displayOrder: 3, comingSoon: true, children: [] },
          { id: 'nav-kpi-delivery', parentId: 'nav-kpi', label: '수주/납품리드타임 (D)', icon: 'Truck', href: '/app/mes/kpi/delivery-lead-time', displayOrder: 4, comingSoon: true, children: [] },
          { id: 'nav-kpi-energy', parentId: 'nav-kpi', label: '전력사용량 (E)', icon: 'Cpu', href: '/app/mes/kpi/energy', displayOrder: 5, comingSoon: true, children: [] },
          { id: 'nav-kpi-uph', parentId: 'nav-kpi', label: 'UPH (P)', icon: 'BarChart2', href: '/app/mes/kpi/uph', displayOrder: 6, comingSoon: true, children: [] },
          { id: 'nav-kpi-oee', parentId: 'nav-kpi', label: '설비가동률 (P)', icon: 'BarChart2', href: '/app/mes/kpi/equipment-oee', displayOrder: 7, comingSoon: true, children: [] },
        ],
      },
      // 6. 품질관리
      {
        id: 'nav-quality',
        parentId: 'section-mes',
        label: '품질관리',
        icon: 'ShieldCheck',
        displayOrder: 60,
        children: [
          { id: 'nav-defect-stats', parentId: 'nav-quality', label: '불량통계(자주검사)', icon: 'BarChart2', href: '/app/mes/quality/defect-stats', displayOrder: 1, comingSoon: true, children: [] },
          { id: 'nav-inspection-stages', parentId: 'nav-quality', label: '초중종검사LIST', icon: 'ClipboardCheck', href: '/app/mes/inspection-stages', displayOrder: 2, children: [] },
          { id: 'nav-work-standards', parentId: 'nav-quality', label: '작업표준서관리', icon: 'BookOpen', href: '/app/mes/quality/work-standards', displayOrder: 3, comingSoon: true, children: [] },
          { id: 'nav-ecn', parentId: 'nav-quality', label: '변경점정보등록', icon: 'GitPullRequest', href: '/app/mes/ecn', displayOrder: 4, children: [] },
          { id: 'nav-change-points', parentId: 'nav-quality', label: '변경점정보LIST', icon: 'FileText', href: '/app/mes/quality/change-points', displayOrder: 5, comingSoon: true, children: [] },
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
          { id: 'nav-sales-orders', parentId: 'nav-sales', label: '수주등록', icon: 'ClipboardList', href: '/app/mes/sales-orders', displayOrder: 1, children: [] },
          { id: 'nav-sales-status', parentId: 'nav-sales', label: '수주현황', icon: 'BarChart2', href: '/app/mes/sales/order-status', displayOrder: 2, children: [] },
          { id: 'nav-shipments', parentId: 'nav-sales', label: '납품정보등록', icon: 'Truck', href: '/app/mes/shipments', displayOrder: 3, children: [] },
          { id: 'nav-delivery-status', parentId: 'nav-sales', label: '납품현황', icon: 'FileBarChart', href: '/app/mes/sales/delivery-status', displayOrder: 4, comingSoon: true, children: [] },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  // LMS
  // ═══════════════════════════════════════════════════════════════
  {
    id: 'section-lms',
    parentId: null,
    label: 'LMS',
    icon: 'Cpu',
    displayOrder: 2,
    children: [
      // 1. 설비 모니터링
      {
        id: 'nav-lms-monitoring',
        parentId: 'section-lms',
        label: '설비 모니터링',
        icon: 'Monitor',
        displayOrder: 10,
        children: [
          { id: 'nav-lms-analysis', parentId: 'nav-lms-monitoring', label: '분석모니터링', icon: 'Activity', href: '/app/mes/equipment-monitor', displayOrder: 1, children: [] },
          { id: 'nav-lms-status', parentId: 'nav-lms-monitoring', label: '현황모니터링', icon: 'LayoutDashboard', href: '/app/lms/monitoring/status', displayOrder: 2, comingSoon: true, children: [] },
        ],
      },
      // 2. 설비관리
      {
        id: 'nav-lms-equipment',
        parentId: 'section-lms',
        label: '설비관리',
        icon: 'Wrench',
        displayOrder: 20,
        children: [
          { id: 'nav-lms-errors', parentId: 'nav-lms-equipment', label: '에러보기', icon: 'AlertTriangle', href: '/app/lms/equipment/errors', displayOrder: 1, comingSoon: true, children: [] },
          { id: 'nav-lms-params', parentId: 'nav-lms-equipment', label: '파라미터보기', icon: 'Settings', href: '/app/lms/equipment/parameters', displayOrder: 2, comingSoon: true, children: [] },
          { id: 'nav-lms-repair-req', parentId: 'nav-lms-equipment', label: '설비수리요청', icon: 'Wrench', href: '/app/mes/equipment-repair', displayOrder: 3, children: [] },
          { id: 'nav-lms-repair-list', parentId: 'nav-lms-equipment', label: '설비수리요청LIST', icon: 'ClipboardList', href: '/app/lms/equipment/repair-list', displayOrder: 4, comingSoon: true, children: [] },
          { id: 'nav-lms-repair-done', parentId: 'nav-lms-equipment', label: '설비수리완료LIST', icon: 'FileCheck', href: '/app/lms/equipment/repair-completed', displayOrder: 5, comingSoon: true, children: [] },
          { id: 'nav-lms-problem-types', parentId: 'nav-lms-equipment', label: '설비문제유형등록', icon: 'AlertTriangle', href: '/app/mes/equipment-problems', displayOrder: 6, children: [] },
          { id: 'nav-lms-daily-check', parentId: 'nav-lms-equipment', label: '설비일상점검등록', icon: 'ClipboardCheck', href: '/app/mes/equipment-check', displayOrder: 7, children: [] },
          { id: 'nav-lms-check-status', parentId: 'nav-lms-equipment', label: '설비일상점검현황', icon: 'BarChart2', href: '/app/lms/equipment/check-status', displayOrder: 8, comingSoon: true, children: [] },
        ],
      },
      // 3. 설비 통계분석
      {
        id: 'nav-lms-statistics',
        parentId: 'section-lms',
        label: '설비 통계분석',
        icon: 'FileBarChart',
        displayOrder: 30,
        children: [
          { id: 'nav-lms-stat-prod', parentId: 'nav-lms-statistics', label: '생산량', icon: 'BarChart2', href: '/app/lms/statistics/production', displayOrder: 1, comingSoon: true, children: [] },
          { id: 'nav-lms-stat-capacity', parentId: 'nav-lms-statistics', label: '능력', icon: 'Activity', href: '/app/lms/statistics/capacity', displayOrder: 2, comingSoon: true, children: [] },
          { id: 'nav-lms-stat-errors', parentId: 'nav-lms-statistics', label: '에러', icon: 'AlertTriangle', href: '/app/lms/statistics/errors', displayOrder: 3, comingSoon: true, children: [] },
          { id: 'nav-lms-stat-energy', parentId: 'nav-lms-statistics', label: '전력', icon: 'Cpu', href: '/app/lms/statistics/energy', displayOrder: 4, comingSoon: true, children: [] },
          { id: 'nav-lms-stat-downtime', parentId: 'nav-lms-statistics', label: '기계 비가동 시간', icon: 'CalendarDays', href: '/app/lms/statistics/downtime', displayOrder: 5, comingSoon: true, children: [] },
          { id: 'nav-lms-stat-worktime', parentId: 'nav-lms-statistics', label: '작업 시간', icon: 'CalendarDays', href: '/app/lms/statistics/work-time', displayOrder: 6, comingSoon: true, children: [] },
        ],
      },
      // 4. 설비연동 설정
      {
        id: 'nav-lms-integration',
        parentId: 'section-lms',
        label: '설비연동 설정',
        icon: 'Cable',
        displayOrder: 40,
        children: [
          { id: 'nav-gateways', parentId: 'nav-lms-integration', label: 'Edge Gateway', icon: 'Wifi', href: '/app/mes/gateways', displayOrder: 1, children: [] },
          { id: 'nav-equipment-connections', parentId: 'nav-lms-integration', label: '설비 연결 설정', icon: 'Cable', href: '/app/mes/equipment-connections', displayOrder: 2, children: [] },
          { id: 'nav-tags', parentId: 'nav-lms-integration', label: '태그 사전', icon: 'Tag', href: '/app/mes/tags', displayOrder: 3, children: [] },
        ],
      },
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
        children: [
          { id: 'nav-common-codes', parentId: 'nav-sysadmin', label: '공통코드 관리', icon: 'BookOpen', href: '/app/mes/common-codes', displayOrder: 1, children: [] },
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
          { id: 'nav-traceability', parentId: 'nav-traceability-section', label: 'LOT Traceability', icon: 'Network', href: '/app/mes/traceability', displayOrder: 2, children: [] },
          { id: 'nav-costing', parentId: 'nav-traceability-section', label: '원가분석', icon: 'Calculator', href: '/app/mes/costing', displayOrder: 3, children: [] },
        ],
      },
    ],
  },
];
