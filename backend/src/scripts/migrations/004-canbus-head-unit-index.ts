/**
 * Migration 004: allow multiple CANBus settings per vehicle by head unit type.
 *
 * Older versions created a unique vehicleId index. Remove it and recreate the
 * compound sparse index used by the current CANBusSetting schema.
 */

import mongoose from 'mongoose'

export const migrationInfo = {
  version: '004',
  name: 'canbus-head-unit-index',
  description: 'Replace the legacy vehicle-only CANBus unique index with a vehicle and head unit type index.',
  author: 'Codex',
  createdAt: '2026-08-22',
  estimatedTime: '1 minute',
}

export async function up(): Promise<void> {
  const db = mongoose.connection.db
  if (!db) throw new Error('Database connection not available')

  const collection = db.collection('canbussettings')
  const indexes = await collection.indexes().catch(() => [])
  const legacy = indexes.find(index => index.name === 'vehicleId_1')
  if (legacy?.name) {
    await collection.dropIndex(legacy.name)
  }

  const compoundName = 'vehicleId_1_headUnitTypeId_1'
  if (!indexes.some(index => index.name === compoundName)) {
    await collection.createIndex(
      { vehicleId: 1, headUnitTypeId: 1 },
      { unique: true, sparse: true, name: compoundName },
    )
  }
}

export async function down(): Promise<void> {
  // 新版本允许同一车型为不同主机类型保存多条设置。恢复旧的 vehicleId
  // 唯一索引会拒绝这些合法数据，因此回滚代码时保留兼容新结构的索引。
  console.log('CANBus 索引回滚跳过：保留车型与主机类型复合唯一索引。')
}
