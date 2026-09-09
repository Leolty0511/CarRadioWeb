export interface SortableVehicle {
  brand?: string
  model?: string
  modelName?: string
  year?: string
}

const textCompare = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })

/** 年份可能是单年或区间，按最早年份排序；无法识别的值放在末尾。 */
export const compareVehicleYears = (left: string, right: string) => {
  const leftYear = Number(left.match(/\d{4}/)?.[0] || Number.POSITIVE_INFINITY)
  const rightYear = Number(right.match(/\d{4}/)?.[0] || Number.POSITIVE_INFINITY)
  return leftYear - rightYear || textCompare(left, right)
}

export const compareVehicles = (left: SortableVehicle, right: SortableVehicle) => {
  const brandResult = textCompare(left.brand || '', right.brand || '')
  if (brandResult !== 0) {return brandResult}

  const leftModel = left.model || left.modelName || ''
  const rightModel = right.model || right.modelName || ''
  const modelResult = textCompare(leftModel, rightModel)
  if (modelResult !== 0) {return modelResult}

  return compareVehicleYears(left.year || '', right.year || '')
}

export const sortVehicles = <T extends SortableVehicle>(vehicles: T[]) =>
  [...vehicles].sort(compareVehicles)
