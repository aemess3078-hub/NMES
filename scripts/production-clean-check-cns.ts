import fs from "fs"
import path from "path"
import { PrismaClient } from "@prisma/client"

const ROOT = process.cwd()
const ENV_FILE = path.join(ROOT, ".env.deploy")

function loadEnvDeploy() {
  if (!fs.existsSync(ENV_FILE)) return

  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
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

const checks = [
  ["Tenant", "tenant"],
  ["Item", "item"],
  ["Bom", "bOM"],
  ["Routing", "routing"],
  ["BusinessPartner", "businessPartner"],
  ["SalesOrder", "salesOrder"],
  ["PurchaseOrder", "purchaseOrder"],
  ["WorkOrder", "workOrder"],
  ["Lot", "lot"],
  ["InventoryBalance", "inventoryBalance"],
  ["InventoryTransaction", "inventoryTransaction"],
  ["ProductionResult", "productionResult"],
  ["QualityInspection", "qualityInspection"],
  ["ShipmentOrder", "shipmentOrder"],
  ["FinishedGoodsReceipt", "finishedGoodsReceipt"],
  ["WorkOrderMaterialLot", "workOrderMaterialLot"],
  ["WipUnit", "wipUnit"],
  ["WipMovement", "wipMovement"],
] as const

async function main() {
  const result: Record<string, number> = {}

  for (const [label, delegateName] of checks) {
    const delegate = (prisma as unknown as Record<string, { count: () => Promise<number> }>)[delegateName]
    if (!delegate) {
      throw new Error(`Missing Prisma delegate: ${delegateName}`)
    }
    result[label] = await delegate.count()
  }

  console.log(JSON.stringify(result, null, 2))

  const mustBeZero = [
    "Item",
    "Bom",
    "Routing",
    "BusinessPartner",
    "SalesOrder",
    "PurchaseOrder",
    "WorkOrder",
    "Lot",
    "InventoryBalance",
    "InventoryTransaction",
    "ProductionResult",
    "QualityInspection",
    "ShipmentOrder",
    "FinishedGoodsReceipt",
    "WorkOrderMaterialLot",
    "WipUnit",
    "WipMovement",
  ]

  const dirty = mustBeZero.filter((label) => result[label] !== 0)
  if (dirty.length > 0) {
    throw new Error(`Production DB is not clean: ${dirty.join(", ")}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
