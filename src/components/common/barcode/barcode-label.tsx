"use client"

import { useEffect, useRef } from "react"
import JsBarcode from "jsbarcode"

interface BarcodeLabelProps {
  itemCode: string
  itemName: string
  lotId?: string
  quantity?: number
  uom?: string
  date?: string
  className?: string
}

/**
 * 바코드 라벨 컴포넌트
 * 형식: {itemCode}|{lotId}  (lotId가 없으면 itemCode만)
 */
export function BarcodeLabel({
  itemCode,
  itemName,
  lotId,
  quantity,
  uom,
  date,
  className,
}: BarcodeLabelProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const barcodeValue = lotId ? `${itemCode}|${lotId}` : itemCode

  useEffect(() => {
    if (!svgRef.current) return
    try {
      JsBarcode(svgRef.current, barcodeValue, {
        format: "CODE128",
        width: 2,
        height: 60,
        displayValue: false,
        margin: 0,
      })
    } catch (e) {
      console.error("바코드 생성 오류:", e)
    }
  }, [barcodeValue])

  return (
    <div className={`bg-white border rounded-md p-3 w-[240px] text-center select-none ${className ?? ""}`}>
      {/* 품목명 */}
      <p className="text-[11px] font-semibold text-gray-800 truncate leading-tight">{itemName}</p>
      <p className="text-[10px] text-gray-500 mb-1">{itemCode}</p>

      {/* 바코드 SVG */}
      <svg ref={svgRef} className="w-full" />

      {/* 바코드 값 텍스트 */}
      <p className="text-[9px] text-gray-400 mt-0.5 font-mono">{barcodeValue}</p>

      {/* LOT / 수량 / 날짜 */}
      <div className="mt-1.5 pt-1.5 border-t border-gray-100 flex flex-wrap justify-center gap-x-3 gap-y-0.5">
        {lotId && (
          <span className="text-[10px] text-gray-600">LOT: <span className="font-medium">{lotId}</span></span>
        )}
        {quantity !== undefined && (
          <span className="text-[10px] text-gray-600">수량: <span className="font-medium">{quantity.toLocaleString()} {uom}</span></span>
        )}
        {date && (
          <span className="text-[10px] text-gray-600">{date}</span>
        )}
      </div>
    </div>
  )
}
