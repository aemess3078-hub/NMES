import fs from "fs"
import path from "path"
import bcrypt from "bcryptjs"
import { PrismaClient, PermissionAction, SiteType, TenantStatus, UserRole } from "@prisma/client"

const ROOT = process.cwd()
const ENV_FILE = path.join(ROOT, ".env.deploy")

function loadEnvDeploy() {
  if (!fs.existsSync(ENV_FILE)) return

  const lines = fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue

    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] ??= value
  }
}

loadEnvDeploy()

const prisma = new PrismaClient()

const TENANT_ID = "cns-medical"
const SITE_ID = "site-cns-medical-main"

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required.`)
  }
  return value
}

const features = [
  { code: "ITEM", name: "Item management", category: "MASTER", icon: "Package", menuCodes: ["items", "item-categories", "item-groups", "sites", "locations"], isCore: true, displayOrder: 10 },
  { code: "PARTNER_MANAGEMENT", name: "Partner management", category: "MASTER", icon: "Handshake", menuCodes: ["customers", "vendors"], isCore: false, displayOrder: 15 },
  { code: "BOM", name: "BOM management", category: "MASTER", icon: "GitBranch", menuCodes: ["bom"], isCore: false, displayOrder: 20 },
  { code: "ROUTING", name: "Routing management", category: "MASTER", icon: "Network", menuCodes: ["routing", "work-centers"], isCore: false, displayOrder: 30 },
  { code: "EQUIPMENT", name: "Equipment management", category: "MASTER", icon: "Cpu", menuCodes: ["equipment"], isCore: false, displayOrder: 40 },
  { code: "WORK_ORDER", name: "Work order", category: "PRODUCTION", icon: "ClipboardList", menuCodes: ["work-orders", "work-queue"], isCore: false, displayOrder: 50 },
  { code: "QUOTATION", name: "Quotation", category: "SALES", icon: "FileText", menuCodes: ["quotations"], isCore: false, displayOrder: 55 },
  { code: "PRODUCTION_PLAN", name: "Production plan", category: "PRODUCTION", icon: "CalendarDays", menuCodes: ["production-plan"], isCore: false, displayOrder: 60 },
  { code: "PRODUCTION_RESULT", name: "Production result", category: "PRODUCTION", icon: "BarChart2", menuCodes: ["production-results", "equipment-output", "finished-goods-receipt"], isCore: false, displayOrder: 70 },
  { code: "DASHBOARD", name: "Dashboard", category: "ANALYTICS", icon: "LayoutDashboard", menuCodes: ["dashboard", "kpi"], isCore: false, displayOrder: 80 },
  { code: "INVENTORY", name: "Inventory", category: "MATERIAL", icon: "Boxes", menuCodes: ["inventory", "inventory-transactions", "stock", "wip-inventory"], isCore: false, displayOrder: 90 },
  { code: "COSTING", name: "Costing", category: "ANALYTICS", icon: "Calculator", menuCodes: ["costing"], isCore: false, displayOrder: 95 },
  { code: "LOT_TRACKING", name: "LOT tracking", category: "MATERIAL", icon: "ScanLine", menuCodes: ["lot", "lot-rules", "traceability", "lot-history", "manufacturing-traceability"], isCore: false, displayOrder: 100 },
  { code: "QUALITY_INSPECTION", name: "Quality inspection", category: "QUALITY", icon: "CheckCircle", menuCodes: ["inspection", "work-standards"], isCore: false, displayOrder: 110 },
  { code: "INSPECTION_STAGES", name: "Inspection stages", category: "QUALITY", icon: "ListChecks", menuCodes: ["inspection-stages", "inspection-standards"], isCore: false, displayOrder: 115 },
  { code: "DEFECT_MANAGEMENT", name: "Defect management", category: "QUALITY", icon: "AlertTriangle", menuCodes: ["defects", "ecn", "defect-stats"], isCore: false, displayOrder: 120 },
  { code: "EQUIPMENT_CONNECTION", name: "Equipment connection", category: "EQUIPMENT", icon: "Wifi", menuCodes: ["gateways", "equipment-connections"], isCore: false, displayOrder: 130 },
  { code: "EQUIPMENT_MANAGEMENT", name: "Equipment maintenance", category: "EQUIPMENT", icon: "Wrench", menuCodes: ["equipment-repair", "equipment-check", "equipment-problems", "equipment-check-status", "equipment-statistics", "molds", "parameters", "errors", "capacity"], isCore: false, displayOrder: 135 },
  { code: "EQUIPMENT_MONITOR", name: "Equipment monitor", category: "EQUIPMENT", icon: "Activity", menuCodes: ["equipment-monitor", "status"], isCore: false, displayOrder: 136 },
  { code: "TAG_MANAGEMENT", name: "Tag management", category: "EQUIPMENT", icon: "Tag", menuCodes: ["tags"], isCore: false, displayOrder: 140 },
  { code: "COMMON_CODE", name: "Common code", category: "SYSTEM", icon: "BookOpen", menuCodes: ["common-codes"], isCore: true, displayOrder: 150 },
  { code: "MRP", name: "MRP", category: "PRODUCTION", icon: "Calculator", menuCodes: ["mrp"], isCore: false, displayOrder: 160 },
  { code: "PERMISSION", name: "Permission", category: "SYSTEM", icon: "Shield", menuCodes: ["users"], isCore: true, displayOrder: 170 },
  { code: "FEATURE_MANAGEMENT", name: "Feature management", category: "SYSTEM", icon: "Puzzle", menuCodes: ["features"], isCore: true, displayOrder: 180 },
  { code: "SALES_ORDER", name: "Sales order", category: "SALES", icon: "ClipboardList", menuCodes: ["sales-orders", "shipments", "order-status", "delivery-status"], isCore: false, displayOrder: 190 },
  { code: "SHIPMENT", name: "Shipment", category: "SALES", icon: "Truck", menuCodes: ["shipments"], isCore: false, displayOrder: 200 },
  { code: "PURCHASE_ORDER", name: "Purchase order", category: "PURCHASE", icon: "FileInput", menuCodes: ["purchase-orders", "material-receipt", "material-issue", "outsourcing"], isCore: false, displayOrder: 210 },
  { code: "ITEM_PRICE", name: "Item price", category: "PURCHASE", icon: "CircleDollarSign", menuCodes: ["item-prices"], isCore: false, displayOrder: 220 },
]

const featureDependencies = [
  ["BOM", "ITEM", true],
  ["ROUTING", "ITEM", true],
  ["WORK_ORDER", "ITEM", true],
  ["WORK_ORDER", "BOM", true],
  ["WORK_ORDER", "ROUTING", true],
  ["PRODUCTION_PLAN", "ITEM", true],
  ["PRODUCTION_PLAN", "WORK_ORDER", false],
  ["PRODUCTION_RESULT", "WORK_ORDER", true],
  ["INVENTORY", "ITEM", true],
  ["LOT_TRACKING", "INVENTORY", true],
  ["QUALITY_INSPECTION", "WORK_ORDER", true],
  ["DEFECT_MANAGEMENT", "QUALITY_INSPECTION", true],
  ["TAG_MANAGEMENT", "EQUIPMENT", true],
  ["TAG_MANAGEMENT", "EQUIPMENT_CONNECTION", true],
] as const

const permissionResources = [
  "PRODUCTION_PLAN",
  "WORK_ORDER",
  "ITEM",
  "BOM",
  "ROUTING",
  "INVENTORY",
  "QUALITY_INSPECTION",
  "EQUIPMENT",
  "COMMON_CODE",
  "USER_MANAGEMENT",
  "AUDIT_LOG",
  "APPROVAL",
  "REPORT",
]

async function upsertAccount(params: {
  profileId: string
  tenantUserId: string
  email: string
  loginId: string
  name: string
  role: UserRole
  password: string
}) {
  const profile = await prisma.profile.upsert({
    where: { email: params.email },
    update: { name: params.name },
    create: {
      id: params.profileId,
      email: params.email,
      name: params.name,
    },
  })

  await prisma.tenantUser.upsert({
    where: { id: params.tenantUserId },
    update: {
      role: params.role,
      siteId: SITE_ID,
      isActive: true,
    },
    create: {
      id: params.tenantUserId,
      tenantId: TENANT_ID,
      profileId: profile.id,
      siteId: SITE_ID,
      role: params.role,
      isActive: true,
    },
  })

  const normalizedLoginId = params.loginId.trim().toLowerCase()
  const existing = await prisma.userCredential.findFirst({
    where: {
      OR: [
        { profileId: profile.id },
        { tenantId: TENANT_ID, loginId: normalizedLoginId },
      ],
    },
  })

  if (existing) {
    await prisma.userCredential.update({
      where: { id: existing.id },
      data: {
        tenantId: TENANT_ID,
        loginId: normalizedLoginId,
        profileId: profile.id,
        isLocked: false,
        failCount: 0,
      },
    })
    return
  }

  const passwordHash = await bcrypt.hash(params.password, 12)
  await prisma.userCredential.create({
    data: {
      tenantId: TENANT_ID,
      loginId: normalizedLoginId,
      profileId: profile.id,
      passwordHash,
      mustChangePw: true,
      isLocked: false,
      failCount: 0,
    },
  })
}

async function seedTenantAndSite() {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {
      code: "CNS-MEDICAL",
      name: "CNS MEDICAL",
      status: TenantStatus.ACTIVE,
    },
    create: {
      id: TENANT_ID,
      code: "CNS-MEDICAL",
      name: "CNS MEDICAL",
      status: TenantStatus.ACTIVE,
    },
  })

  await prisma.site.upsert({
    where: { id: SITE_ID },
    update: {
      code: "CNS-MAIN",
      name: "CNS MEDICAL 기본 사업장",
      type: SiteType.FACTORY,
    },
    create: {
      id: SITE_ID,
      tenantId: TENANT_ID,
      code: "CNS-MAIN",
      name: "CNS MEDICAL 기본 사업장",
      type: SiteType.FACTORY,
    },
  })
}

async function seedPermissions() {
  const actions = [
    PermissionAction.READ,
    PermissionAction.CREATE,
    PermissionAction.UPDATE,
    PermissionAction.DELETE,
    PermissionAction.APPROVE,
    PermissionAction.EXPORT,
  ]

  for (const role of [UserRole.OWNER, UserRole.ADMIN]) {
    for (const resource of permissionResources) {
      for (const action of actions) {
        await prisma.rolePermission.upsert({
          where: {
            tenantId_role_resource_action: {
              tenantId: TENANT_ID,
              role,
              resource,
              action,
            },
          },
          update: { isAllowed: true },
          create: {
            tenantId: TENANT_ID,
            role,
            resource,
            action,
            isAllowed: true,
          },
        })
      }
    }
  }
}

async function seedFeatures() {
  for (const feature of features) {
    await prisma.featureDefinition.upsert({
      where: { code: feature.code },
      update: feature,
      create: feature,
    })
  }

  const existingFeatures = await prisma.featureDefinition.findMany()
  const featureMap = new Map(existingFeatures.map((feature) => [feature.code, feature.id]))

  for (const [from, to, required] of featureDependencies) {
    const featureId = featureMap.get(from)
    const dependsOnId = featureMap.get(to)
    if (!featureId || !dependsOnId) continue

    await prisma.featureDependency.upsert({
      where: {
        featureId_dependsOnId: {
          featureId,
          dependsOnId,
        },
      },
      update: { isRequired: required },
      create: {
        featureId,
        dependsOnId,
        isRequired: required,
      },
    })
  }

  for (const featureId of Array.from(featureMap.values())) {
    await prisma.tenantFeature.upsert({
      where: {
        tenantId_featureId: {
          tenantId: TENANT_ID,
          featureId,
        },
      },
      update: { isEnabled: true },
      create: {
        tenantId: TENANT_ID,
        featureId,
        isEnabled: true,
      },
    })
  }
}

async function main() {
  if (process.env.DEFAULT_TENANT_ID !== TENANT_ID) {
    throw new Error("DEFAULT_TENANT_ID must be cns-medical for production bootstrap.")
  }

  await seedTenantAndSite()
  await upsertAccount({
    profileId: "profile-cns-admin-bswyg",
    tenantUserId: "tu-cns-admin-bswyg",
    email: "bswyg@cnsmed.co.kr",
    loginId: "bswyg@cnsmed.co.kr",
    name: "안복순",
    role: UserRole.ADMIN,
    password: requiredEnv("CNS_ADMIN_INITIAL_PASSWORD"),
  })
  await upsertAccount({
    profileId: "profile-cns-maintenance-test",
    tenantUserId: "tu-cns-maintenance-test",
    email: "test@cns-medical.local",
    loginId: "test",
    name: "개발자",
    role: UserRole.ADMIN,
    password: requiredEnv("CNS_DEV_INITIAL_PASSWORD"),
  })
  await seedPermissions()
  await seedFeatures()

  console.log("Production bootstrap completed.")
  console.log("Tenant: cns-medical / CNS MEDICAL")
  console.log("Site: CNS MEDICAL 기본 사업장")
  console.log("Accounts: bswyg@cnsmed.co.kr, test")
  console.log("Passwords are not printed.")
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
