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
  const indexes = await collection.indexes()
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
  const db = mongoose.connection.db
  if (!db) throw new Error('Database connection not available')
  const collection = db.collection('canbussettings')
  const indexes = await collection.indexes()
  const compound = indexes.find(index => index.name === 'vehicleId_1_headUnitTypeId_1')
  if (compound?.name) await collection.dropIndex(compound.name)
  if (!indexes.some(index => index.name === 'vehicleId_1')) {
    await collection.createIndex({ vehicleId: 1 }, { unique: true, name: 'vehicleId_1' })
  }
}
