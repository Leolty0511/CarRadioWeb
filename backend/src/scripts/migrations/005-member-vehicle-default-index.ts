/**
 * Migration 005: create the member vehicle collection indexes and normalize
 * legacy/concurrent rows so each member has at most one default vehicle.
 */
import mongoose from 'mongoose'

export const migrationInfo = {
  version: '005',
  name: 'member-vehicle-default-index',
  description: 'Ensure one default vehicle per member and add member vehicle indexes.',
  author: 'Codex',
  createdAt: '2026-09-06',
  estimatedTime: '1 minute',
}

export async function up(): Promise<void> {
  const db = mongoose.connection.db
  if (!db) throw new Error('Database connection not available')
  const collection = db.collection('member_vehicles')

  const duplicateMembers = await collection.aggregate([
    { $match: { isDefault: true } },
    { $sort: { createdAt: 1, _id: 1 } },
    { $group: { _id: '$memberId', ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray()
  for (const group of duplicateMembers) {
    const [keep, ...remove] = group.ids as mongoose.Types.ObjectId[]
    if (remove.length) {
      await collection.updateMany({ _id: { $in: remove } }, { $set: { isDefault: false } })
      await collection.updateOne({ _id: keep }, { $set: { isDefault: true } })
    }
  }

  const indexes = await collection.indexes().catch(() => [])
  if (!indexes.some(index => index.name === 'memberId_1_vehicleId_1')) {
    await collection.createIndex({ memberId: 1, vehicleId: 1 }, { unique: true, name: 'memberId_1_vehicleId_1' })
  }
  if (!indexes.some(index => index.name === 'member_one_default_vehicle')) {
    await collection.createIndex({ memberId: 1 }, { unique: true, partialFilterExpression: { isDefault: true }, name: 'member_one_default_vehicle' })
  }
}

export async function down(): Promise<void> {
  const db = mongoose.connection.db
  if (!db) throw new Error('Database connection not available')
  const collection = db.collection('member_vehicles')
  for (const name of ['member_one_default_vehicle', 'memberId_1_vehicleId_1']) {
    const exists = (await collection.indexes().catch(() => [])).some(index => index.name === name)
    if (exists) await collection.dropIndex(name)
  }
}
