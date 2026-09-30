import { readFileSync } from "fs"
import { join } from "path"

const root = process.cwd()
const navSource = readFileSync(join(root, "src/lib/nav-config.ts"), "utf8")
const materialStockPage = readFileSync(join(root, "src/app/app/mes/material/stock/page.tsx"), "utf8")
const defectsPage = readFileSync(join(root, "src/app/app/mes/defects/page.tsx"), "utf8")
const equipmentStatsPage = readFileSync(join(root, "src/app/app/mes/equipment-statistics/page.tsx"), "utf8")
const sitesPage = readFileSync(join(root, "src/app/app/mes/sites/page.tsx"), "utf8")
const usersPage = readFileSync(join(root, "src/app/app/mes/users/page.tsx"), "utf8")
const moldsPage = readFileSync(join(root, "src/app/app/mes/master/molds/page.tsx"), "utf8")
const vendorsPage = readFileSync(join(root, "src/app/app/mes/vendors/page.tsx"), "utf8")

type NavEntry = {
  id: string
  parentId: string | null
  label: string
  href?: string
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

function findNav(id: string): NavEntry {
  const marker = `id: '${id}'`
  const start = navSource.indexOf(marker)
  if (start < 0) throw new Error(`nav item not found: ${id}`)
  const snippet = navSource.slice(start, start + 700)
  const parentMatch = snippet.match(/parentId: (null|'[^']+')/)
  const labelMatch = snippet.match(/label: '([^']+)'/)
  const hrefMatch = snippet.match(/href: '([^']+)'/)
  if (!parentMatch) throw new Error(`parentId not found: ${id}`)
  if (!labelMatch) throw new Error(`label not found: ${id}`)
  return {
    id,
    parentId: parentMatch[1] === "null" ? null : parentMatch[1].slice(1, -1),
    label: labelMatch[1],
    href: hrefMatch?.[1],
  }
}

function assertLabel(id: string, label: string) {
  const item = findNav(id)
  assert(item.label === label, `${id} label expected ${label}, got ${item.label}`)
}

function assertParent(id: string, parentId: string) {
  const item = findNav(id)
  assert(item.parentId === parentId, `${id} parentId expected ${parentId}, got ${item.parentId}`)
}

function assertHref(id: string, href: string) {
  const item = findNav(id)
  assert(item.href === href, `${id} href expected ${href}, got ${item.href}`)
}

function assertSourceIncludes(source: string, expected: string, label: string) {
  assert(source.includes(expected), `${label} missing expected text: ${expected}`)
}
const canonicalLabels: Array<[string, string]> = [
  ["nav-items", "품목관리"],
  ["nav-item-categories", "품목분류관리"],
  ["nav-item-groups", "품목군관리"],
  ["nav-bom", "BOM관리"],
  ["nav-equipment-master", "설비관리"],
  ["nav-defects", "불량관리"],
  ["nav-routing", "라우팅관리"],
  ["nav-work-centers", "공정관리"],
  ["nav-users", "사용자관리"],
  ["nav-sites", "사업장관리"],
  ["nav-locations", "로케이션관리"],
  ["nav-customers", "고객사관리"],
  ["nav-vendors", "거래처관리"],
  ["nav-inspection-standards", "검사표준관리"],
  ["nav-mold-management", "금형·치공구관리"],
  ["nav-downtime-reasons", "비가동사유"],
  ["nav-purchase-orders", "자재발주현황"],
  ["nav-material-receipt", "자재입고현황"],
  ["nav-material-issue", "자재출고현황"],
  ["nav-material-stock", "자재재고현황"],
  ["nav-inventory", "재고현황"],
  ["nav-inventory-txns", "전체입출고내역"],
  ["nav-wip-inventory", "재공품재고"],
  ["nav-prod-equip-output", "설비별생산현황"],
  ["nav-prod-plan-output", "생산계획별생산현황"],
  ["nav-work-orders", "작업지시"],
  ["nav-production-results", "작업일지(실적)"],
  ["nav-finished-goods-receipt", "완제품입고"],
  ["nav-outsourcing", "외주관리"],
  ["nav-sales-orders", "수주등록"],
  ["nav-sales-status", "수주현황"],
  ["nav-shipments", "납품정보등록"],
  ["nav-delivery-status", "납품현황"],
  ["nav-quality", "품질관리"],
  ["nav-project-management", "PMS(프로젝트관리)"],
]

for (const [id, label] of canonicalLabels) assertLabel(id, label)

assertParent("nav-inventory", "nav-inventory-section")
assertParent("nav-material-stock", "nav-material")

const invariantHrefs: Array<[string, string]> = [
  ["nav-items", "/app/mes/items"],
  ["nav-equipment-master", "/app/mes/master/equipment"],
  ["nav-routing", "/app/mes/routing"],
  ["nav-customers", "/app/mes/customers"],
  ["nav-vendors", "/app/mes/vendors"],
  ["nav-inventory", "/app/mes/inventory"],
  ["nav-material-stock", "/app/mes/material/stock"],
  ["nav-prod-plan-output", "/app/mes/production-plan"],
  ["nav-production-results", "/app/mes/production-results"],
  ["nav-sales-orders", "/app/mes/sales-orders"],
  ["nav-shipments", "/app/mes/shipments"],
]

for (const [id, href] of invariantHrefs) assertHref(id, href)

const forbiddenNavLabels = [
  "공급처 관리",
  "구매처 관리",
  "금형/치공구 기준정보",
  "공구 수명/사용이력",
  "불량코드 관리",
  "사용자 / 권한 관리",
  "원자재 LOT 재고",
]

for (const forbidden of forbiddenNavLabels) {
  assert(!navSource.includes(`label: '${forbidden}'`), `forbidden nav label found: ${forbidden}`)
}

assertSourceIncludes(materialStockPage, "자재재고현황", "material stock H1")
assertSourceIncludes(materialStockPage, "원자재와 소모품의 LOT별 현재고", "material stock description")
assertSourceIncludes(defectsPage, "불량관리", "defects H1")
assertSourceIncludes(equipmentStatsPage, "통합통계", "equipment statistics H1")
assertSourceIncludes(sitesPage, "사업장관리", "sites H1")
assertSourceIncludes(usersPage, "사용자관리", "users H1")
assertSourceIncludes(moldsPage, "금형·치공구관리", "molds H1")
assertSourceIncludes(moldsPage, "기준정보", "molds description")
assertSourceIncludes(vendorsPage, "거래처관리", "vendors H1")
assertSourceIncludes(vendorsPage, "원자재·부품", "vendors supplier description")

assert(!navSource.includes("/app/mes/master/product-groups"), "product-groups must remain hidden from nav")
assert(!navSource.includes("/app/mes/master/mold-inventory"), "mold-inventory must remain hidden from nav")
assert(!navSource.includes("/app/mes/process-progress"), "process-progress must remain hidden from nav")
assert(!navSource.includes("/app/mes/quotations"), "quotations must remain hidden from nav")
assert(!navSource.includes("/app/mes/item-prices"), "item-prices must remain hidden from nav")
assert(!navSource.includes("/app/mes/mrp"), "mrp must remain hidden from nav")
assert(!navSource.includes("/app/mes/final-inspection"), "final-inspection must remain hidden from nav")
assert(!navSource.includes("/app/mes/measurement"), "measurement must remain hidden from nav")

console.log("F25 master menu cleanup integrity: passed")
