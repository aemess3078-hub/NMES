import { InspectionInputType, InspectionJudgement } from "@prisma/client"

// quality.actions.ts(createQualityInspection) 내부에서만 호출되는 순수 검증/계산 헬퍼.
// "use server" 파일은 async 함수만 export할 수 있어(scripts/check-use-server-exports.ts)
// 동기 함수인 이 로직들은 별도 모듈로 분리했다 — self-inspection.helpers.ts와 동일한 이유.
// DB 접근이 없는 순수 함수라 code-path 테스트(scripts/test-measurement-validation.ts)로
// 직접 검증할 수 있다.

export type CreateMeasurementInput = {
  inspectionItemId: string
  sampleNo?: number
  numericValue?: number | null
  textValue?: string | null
  booleanValue?: boolean | null
}

export type SpecItemForValidation = {
  id: string
  name: string
  inputType: InspectionInputType
  lowerLimit: unknown
  upperLimit: unknown
  unit: string | null
}

export type ValidatedMeasurement = {
  inspectionItemId: string
  sampleNo: number
  numericValue: number | null
  textValue: string | null
  booleanValue: boolean | null
  lowerLimitSnapshot: number | null
  upperLimitSnapshot: number | null
  itemNameSnapshot: string
  inputTypeSnapshot: InspectionInputType
  unitSnapshot: string | null
  judgement: InspectionJudgement | null
}

/**
 * NUMERIC 항목의 판정을 확정한다. 편측 규격을 지원한다 —
 * lowerLimit/upperLimit 중 없는 쪽은 그 방향의 이탈을 판단하지 않는다.
 */
export function computeNumericJudgement(
  numericValue: number,
  lowerLimit: number | null,
  upperLimit: number | null
): InspectionJudgement {
  if (lowerLimit != null && numericValue < lowerLimit) return "FAIL"
  if (upperLimit != null && numericValue > upperLimit) return "FAIL"
  return "PASS"
}

/**
 * 클라이언트가 보낸 측정값 입력을 서버 정본(spec에 속한 InspectionItem 목록) 기준으로
 * 전부 재검증하고, 스냅샷/판정까지 확정한다. 클라이언트 값은 신뢰하지 않는다.
 */
export function validateMeasurements(
  measurements: CreateMeasurementInput[],
  specItems: SpecItemForValidation[]
): ValidatedMeasurement[] {
  const itemsById = new Map(specItems.map((item) => [item.id, item]))
  const seen = new Set<string>()

  return measurements.flatMap((m): ValidatedMeasurement[] => {
    const item = itemsById.get(m.inspectionItemId)
    if (!item) {
      throw new Error("측정값의 검사항목이 선택한 검사표준에 속하지 않습니다.")
    }

    const hasNumeric = m.numericValue != null
    const hasText = m.textValue != null && m.textValue !== ""
    const hasBoolean = m.booleanValue != null

    if ([hasNumeric, hasText, hasBoolean].filter(Boolean).length > 1) {
      throw new Error(`'${item.name}' 항목에 서로 다른 값 유형을 동시에 입력할 수 없습니다.`)
    }

    // 값이 하나도 입력되지 않은 행(빈 sample 슬롯)은 저장하지 않는다.
    if (!hasNumeric && !hasText && !hasBoolean) return []

    const sampleNo = m.sampleNo ?? 1
    if (!Number.isInteger(sampleNo) || sampleNo < 1) {
      throw new Error(`'${item.name}' 항목의 sampleNo는 1 이상의 정수여야 합니다.`)
    }
    const dedupeKey = `${item.id}:${sampleNo}`
    if (seen.has(dedupeKey)) {
      throw new Error(`'${item.name}' 항목의 sampleNo ${sampleNo}가 중복되었습니다.`)
    }
    seen.add(dedupeKey)

    const lowerLimit = item.lowerLimit == null ? null : Number(item.lowerLimit)
    const upperLimit = item.upperLimit == null ? null : Number(item.upperLimit)

    let numericValue: number | null = null
    let textValue: string | null = null
    let booleanValue: boolean | null = null
    let judgement: InspectionJudgement | null = null

    switch (item.inputType) {
      case "NUMERIC": {
        if (!hasNumeric) {
          throw new Error(`'${item.name}' 항목은 숫자 측정값만 입력할 수 있습니다.`)
        }
        if (typeof m.numericValue !== "number" || Number.isNaN(m.numericValue)) {
          throw new Error(`'${item.name}' 항목의 측정값은 숫자여야 합니다.`)
        }
        numericValue = m.numericValue
        judgement = computeNumericJudgement(numericValue, lowerLimit, upperLimit)
        break
      }
      case "TEXT":
      case "SELECT": {
        if (!hasText) {
          throw new Error(`'${item.name}' 항목은 텍스트 값만 입력할 수 있습니다.`)
        }
        textValue = String(m.textValue)
        break
      }
      case "BOOLEAN": {
        if (!hasBoolean) {
          throw new Error(`'${item.name}' 항목은 합부(boolean) 값만 입력할 수 있습니다.`)
        }
        booleanValue = Boolean(m.booleanValue)
        break
      }
    }

    return [{
      inspectionItemId: item.id,
      sampleNo,
      numericValue,
      textValue,
      booleanValue,
      lowerLimitSnapshot: lowerLimit,
      upperLimitSnapshot: upperLimit,
      itemNameSnapshot: item.name,
      inputTypeSnapshot: item.inputType,
      unitSnapshot: item.unit,
      judgement,
    }]
  })
}
