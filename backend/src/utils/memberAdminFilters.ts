type RegexCondition = { $regex: string; $options: 'i' }
type FieldCondition = Record<string, RegexCondition>

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildMemberSearchConditions(value: string): FieldCondition[] {
  const pattern = escapeRegex(value.trim())
  if (!pattern) return []
  const condition: RegexCondition = { $regex: pattern, $options: 'i' }
  return [
    { email: condition },
    { nickname: condition },
    { registrationIp: condition },
    { lastSeenIp: condition },
  ]
}

export function buildMemberVehicleFilter(value: {
  vehicleId?: unknown
  brand?: string
  modelName?: string
}): Record<string, unknown> | null {
  if (value.vehicleId) return { vehicleId: value.vehicleId }
  const filter: Record<string, unknown> = {}
  if (value.brand) filter.brand = value.brand
  if (value.modelName) filter.modelName = value.modelName
  return Object.keys(filter).length > 0 ? filter : null
}
