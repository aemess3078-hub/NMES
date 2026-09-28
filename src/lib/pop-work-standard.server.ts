import { prisma } from "@/lib/db/prisma"
import type { Prisma } from "@prisma/client"

type PopWorkStandardDb = Prisma.TransactionClient | typeof prisma

export type PopWorkStandard = {
  mappingId: string
  documentId: string
  code: string
  name: string
  fileUrl: string
  displayOrder: number
}

export async function getWorkStandardsForOperationContext(
  db: PopWorkStandardDb,
  params: {
    tenantId: string
    itemId: string
    routingOperationId: string
  }
): Promise<PopWorkStandard[]> {
  const rows = await db.workStandardMapping.findMany({
    where: {
      tenantId: params.tenantId,
      itemId: params.itemId,
      routingOperationId: params.routingOperationId,
      isActive: true,
      document: {
        docType: "SOP",
        fileUrl: { not: null },
      },
    },
    include: {
      document: {
        select: {
          id: true,
          code: true,
          name: true,
          fileUrl: true,
        },
      },
    },
    orderBy: [
      { displayOrder: "asc" },
      { document: { code: "asc" } },
      { document: { name: "asc" } },
    ],
  })

  return rows
    .filter((row) => row.document.fileUrl?.trim())
    .map((row) => ({
      mappingId: row.id,
      documentId: row.documentId,
      code: row.document.code,
      name: row.document.name,
      fileUrl: row.document.fileUrl as string,
      displayOrder: row.displayOrder,
    }))
}
