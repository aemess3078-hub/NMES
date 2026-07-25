export type ShipmentLabelSourceItem = {
  qty: number | string
  lotId?: string | null
  lot?: { lotNo: string } | null
  item: {
    code: string
    name: string
    uom?: string | null
    isLotTracked: boolean
  }
}

export type ShipmentLabelData = {
  itemCode: string
  itemName: string
  lotId?: string
  lotNo?: string
  quantity: number
  uom?: string
}

export function buildShipmentLabelItems(
  items: ShipmentLabelSourceItem[],
): ShipmentLabelData[] {
  return items.flatMap((shipmentItem) => {
    const quantity = Number(shipmentItem.qty)
    if (!shipmentItem.item.code || quantity <= 0) return []
    if (
      shipmentItem.item.isLotTracked &&
      (!shipmentItem.lotId || !shipmentItem.lot?.lotNo?.trim())
    ) {
      return []
    }

    return [{
      itemCode: shipmentItem.item.code,
      itemName: shipmentItem.item.name,
      lotId: shipmentItem.lotId ?? undefined,
      lotNo: shipmentItem.lot?.lotNo ?? undefined,
      quantity,
      uom: shipmentItem.item.uom ?? undefined,
    }]
  })
}
