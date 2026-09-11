import { useMemo } from 'react'
import { CarFront, X } from 'lucide-react'
import { compareVehicleYears } from '@/utils/vehicleSorting'

export interface MemberVehicleFilterOption {
  vehicleId: string
  brand: string
  modelName: string
  yearRange: string
  generation?: string
  memberCount: number
}

export interface MemberVehicleFilterValue {
  brand: string
  modelName: string
  vehicleId: string
}

interface MemberVehicleFilterProps {
  options: MemberVehicleFilterOption[]
  value: MemberVehicleFilterValue
  loading?: boolean
  onChange: (value: MemberVehicleFilterValue) => void
}

const textCompare = (left: string, right: string) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
const selectClassName = 'h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800'

export function MemberVehicleFilter({ options, value, loading = false, onChange }: MemberVehicleFilterProps) {
  const brands = useMemo(() => [...new Set(options.map((item) => item.brand).filter(Boolean))].sort(textCompare), [options])
  const models = useMemo(() => [...new Set(options.filter((item) => item.brand === value.brand).map((item) => item.modelName).filter(Boolean))].sort(textCompare), [options, value.brand])
  const years = useMemo(() => options
    .filter((item) => item.brand === value.brand && item.modelName === value.modelName)
    .sort((left, right) => compareVehicleYears(left.yearRange, right.yearRange) || textCompare(left.generation || '', right.generation || '')), [options, value.brand, value.modelName])
  const active = Boolean(value.brand)

  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/40 lg:flex-row lg:items-end">
      <div className="flex min-w-32 items-center gap-2 self-start pb-1 text-sm font-medium text-slate-700 dark:text-slate-200 lg:self-center lg:pb-0">
        <CarFront className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <span>按车辆筛选</span>
      </div>
      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-3">
        <label className="grid gap-1 text-xs text-slate-500">
          <span>品牌</span>
          <select value={value.brand} disabled={loading} onChange={(event) => onChange({ brand: event.target.value, modelName: '', vehicleId: '' })} className={selectClassName}>
            <option value="">{loading ? '正在加载...' : '全部品牌'}</option>
            {brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-500">
          <span>车型</span>
          <select value={value.modelName} disabled={!value.brand || loading} onChange={(event) => onChange({ ...value, modelName: event.target.value, vehicleId: '' })} className={selectClassName}>
            <option value="">全部车型</option>
            {models.map((model) => <option key={model} value={model}>{model}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-500">
          <span>年份区间</span>
          <select value={value.vehicleId} disabled={!value.modelName || loading} onChange={(event) => onChange({ ...value, vehicleId: event.target.value })} className={selectClassName}>
            <option value="">全部年份</option>
            {years.map((vehicle) => <option key={vehicle.vehicleId} value={vehicle.vehicleId}>{vehicle.yearRange}{vehicle.generation ? ` · ${vehicle.generation}` : ''}（{vehicle.memberCount} 人）</option>)}
          </select>
        </label>
      </div>
      {active && (
        <button type="button" title="清除车辆筛选" aria-label="清除车辆筛选" onClick={() => onChange({ brand: '', modelName: '', vehicleId: '' })} className="flex h-10 w-10 flex-shrink-0 items-center justify-center self-end rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
