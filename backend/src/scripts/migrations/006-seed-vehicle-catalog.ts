import { Vehicle } from '../../models/Vehicle'
import { DEFAULT_VEHICLE_CATALOG } from '../../data/defaultVehicleCatalog'

export async function up(): Promise<void> {
  const catalog = DEFAULT_VEHICLE_CATALOG.filter(item => item.brand.trim() && item.modelName.trim() && item.year.trim())
  const existing = await Vehicle.find({ language: 'en' })
    .select('brand modelName year')
    .lean()
  const existingKeys = new Set(existing.map(item => `${item.brand}\u0000${item.modelName}\u0000${item.year}`))
  let nextId = ((await Vehicle.findOne({ language: 'en' }).sort({ id: -1 }).select('id').lean())?.id || 0) + 1
  const documents = []

  for (const item of catalog) {
    const brand = item.brand.trim()
    const modelName = item.modelName.trim()
    const year = item.year.trim()
    const key = `${brand}\u0000${modelName}\u0000${year}`
    if (existingKeys.has(key)) continue
    existingKeys.add(key)
    documents.push({
      id: nextId++,
      brand,
      modelName,
      year,
      password: '',
      documents: 0,
      language: 'en' as const,
    })
  }

  // 小批量写入，限制升级期间的 MongoDB 峰值内存和磁盘压力。
  const batchSize = 25
  for (let offset = 0; offset < documents.length; offset += batchSize) {
    await Vehicle.insertMany(documents.slice(offset, offset + batchSize), { ordered: true })
  }
  console.log(`车型目录迁移完成：新增 ${documents.length} 条，跳过已存在 ${catalog.length - documents.length} 条`)
}

export async function validate(): Promise<boolean> {
  const expected = new Set(DEFAULT_VEHICLE_CATALOG
    .filter(item => item.brand.trim() && item.modelName.trim() && item.year.trim())
    .map(item => `${item.brand.trim()}\u0000${item.modelName.trim()}\u0000${item.year.trim()}`))
  const actual = await Vehicle.find({ language: 'en' }).select('brand modelName year').lean()
  const actualKeys = new Set(actual.map(item => `${item.brand}\u0000${item.modelName}\u0000${item.year}`))
  return [...expected].every(key => actualKeys.has(key))
}

export async function down(): Promise<void> {
  // Seed rows are intentionally retained on rollback. Their ObjectIds are not
  // recorded in migration history, and deleting by field values could remove
  // production records that were edited or linked after import.
  console.log('车型目录迁移回滚跳过：为保护生产数据，不删除已导入车型。')
}

export const migrationInfo = {
  version: '006',
  name: 'seed-vehicle-catalog',
  description: '导入整理_修正版_v2中的英文车型目录，过滤空品牌和空车型并保持幂等。',
  author: 'CarRadioWeb',
  createdAt: '2026-09-09',
  estimatedTime: '1-2分钟',
}
