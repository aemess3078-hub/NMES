import { readFileSync } from "fs"
import { join } from "path"
import assert from "assert"

const root = process.cwd()

function read(path: string) {
  return readFileSync(join(root, path), "utf8")
}

function ok(value: unknown, message: string) {
  assert.ok(value, message)
  console.log(`PASS ${message}`)
}

const schema = read("prisma/schema.prisma")
const rolePermissions = read("src/lib/auth/role-permissions.ts")
const layout = read("src/app/app/layout.tsx")
const middleware = read("src/middleware.ts")
const permissionActions = read("src/lib/actions/permission.actions.ts")
const productionPlanActions = read("src/lib/actions/production-plan.actions.ts")
const productionPlanPage = read("src/app/app/mes/production-plan/page.tsx")
const productionPlanTable = read("src/app/app/mes/production-plan/plan-data-table.tsx")
const productionPlanColumns = read("src/app/app/mes/production-plan/columns.tsx")
const popActions = read("src/lib/actions/pop.actions.ts")
const shipmentActions = read("src/lib/actions/shipment.actions.ts")
const qualityActions = read("src/lib/actions/quality.actions.ts")

ok(/enum PermissionAction\s*\{[\s\S]*READ[\s\S]*CREATE[\s\S]*UPDATE[\s\S]*DELETE[\s\S]*APPROVE[\s\S]*EXPORT[\s\S]*\}/.test(schema), "RolePermission action enum has READ/CREATE/UPDATE/DELETE plus APPROVE/EXPORT")
ok(/model RolePermission\s*\{[\s\S]*tenantId\s+String[\s\S]*role\s+UserRole[\s\S]*resource\s+String[\s\S]*action\s+PermissionAction[\s\S]*isAllowed\s+Boolean[\s\S]*@@unique\(\[tenantId, role, resource, action\]\)/.test(schema), "RolePermission is tenant scoped by role/resource/action")
ok(/model TenantUser\s*\{[\s\S]*tenantId\s+String[\s\S]*profileId\s+String[\s\S]*role\s+UserRole[\s\S]*isActive\s+Boolean/.test(schema), "TenantUser links one profile to one tenant role with active flag")

ok(rolePermissions.includes('ROLE_PERMISSION_DENIED_MESSAGE = "이 기능을 사용할 권한이 없습니다."'), "server permission helper exposes a generic forbidden message")
ok(/tenantUser\.findFirst\(\{[\s\S]*where:\s*\{\s*profileId,\s*tenantId,\s*isActive:\s*true\s*\}/.test(rolePermissions), "server permission helper re-reads active TenantUser by current tenant")
ok(/rolePermission\.findMany\(\{[\s\S]*where:\s*\{\s*tenantId,\s*role:\s*tenantUser\.role/.test(rolePermissions), "server permission helper reads RolePermission from the current tenant and live role")
ok(!/from "react"/.test(rolePermissions) && !/cache\(/.test(rolePermissions), "server permission helper does not keep RolePermission in a process-global cache")
ok(/if\s*\(tenantUser\.role === "OWNER"\)/.test(rolePermissions), "existing OWNER full-access policy is preserved")
ok(/throw new Error\(ROLE_PERMISSION_DENIED_MESSAGE\)/.test(rolePermissions), "server mutation guard fails before mutation when permission is missing")
ok(/configured\.has\(permissionKey\(resource,\s*"READ"\)\)/.test(rolePermissions), "menu/page READ filtering only applies when a READ row exists")

ok(middleware.includes("x-nmes-pathname"), "middleware forwards pathname to the app layout for direct URL guard")
ok(layout.includes("getCurrentPermissionSnapshot(user)") && layout.includes("canReadPath(permissionSnapshot, pathname)") && layout.includes("canReadMenuCode(permissionSnapshot, menuCode)"), "app layout applies RolePermission READ to direct URL and Sidebar")

ok(productionPlanPage.includes('getResourcePermissions("PRODUCTION_PLAN")') && productionPlanPage.includes("if (!permissions.canRead) notFound()"), "production plan page blocks direct URL without READ")
ok((productionPlanActions.match(/requireResourcePermission\("PRODUCTION_PLAN",\s*"READ"\)/g) ?? []).length >= 4, "production plan query and lookup actions require READ")
ok(productionPlanActions.includes('requireResourcePermission("PRODUCTION_PLAN", "CREATE")'), "production plan create path requires CREATE")
ok(productionPlanActions.includes('requireResourcePermission("PRODUCTION_PLAN", "UPDATE")'), "production plan update path requires UPDATE")
ok(productionPlanActions.includes('requireResourcePermission("PRODUCTION_PLAN", "DELETE")'), "production plan delete path requires DELETE")
ok(/const tenantId = user\.tenantId/.test(productionPlanActions), "production plan mutations use server-resolved tenant instead of client tenant")
ok(/where:\s*\{\s*tenantId:\s*user\.tenantId/.test(productionPlanActions), "production plan list queries are tenant scoped")

ok(productionPlanTable.includes("permissions.canCreate"), "production plan create button follows CREATE permission")
ok(productionPlanColumns.includes("canUpdate") && productionPlanColumns.includes("canDeletePlan"), "production plan row actions follow UPDATE/DELETE permissions")

ok(/rolePermission\.findFirst\(\{\s*where:\s*\{\s*id,\s*tenantId:\s*actor\.tenantId\s*\}/.test(permissionActions), "single permission update is scoped to actor tenant")
ok(/rolePermission\.findMany\(\{[\s\S]*where:\s*\{\s*id:\s*\{\s*in:\s*ids\s*\},\s*tenantId:\s*actor\.tenantId\s*\}/.test(permissionActions), "bulk permission update verifies all target rows are in actor tenant")
ok(/rolePermission\.updateMany\(\{[\s\S]*where:\s*\{\s*id,\s*tenantId:\s*actor\.tenantId\s*\}/.test(permissionActions), "bulk permission update writes with tenant guard")
ok(permissionActions.includes('if (perm.role === "OWNER") throw new Error("OWNER 권한은 수정할 수 없습니다.")'), "OWNER permission rows remain immutable")

ok(!popActions.includes("role-permissions"), "POP worker actions are not tied to general MES RolePermission")
ok(shipmentActions.includes("assertLotQualityReleaseAllowed"), "F06 shipment confirmation keeps F05 quality release revalidation")
ok(qualityActions.includes("assertInspectionHistoryMutable"), "F07 quality/CAPA history guard remains wired")

console.log("PASS role-permission-enforcement static checks complete")
