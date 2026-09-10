/**
 * Migration 002: replace the legacy unique IP index with visitorId.
 */

import mongoose from 'mongoose'

export const migrationInfo = {
  version: '002',
  name: 'fix-visitor-index',
  description: 'Replace the legacy unique IP index with the visitor fingerprint index.',
  author: 'CarRadioWeb',
  createdAt: '2026-08-28',
  estimatedTime: '1 minute',
}

export async function up(): Promise<void> {
  const db = mongoose.connection.db
  if (!db) throw new Error('Database connection not available')

  const exists = await db.listCollections({ name: 'visitorsummaries' }, { nameOnly: true }).hasNext()
  if (!exists) {
    console.log('visitorsummaries collection does not exist; skipping visitor index migration')
    return
  }

  const collection = db.collection('visitorsummaries')
  let indexes = await collection.indexes()
  const legacyIpIndex = indexes.find(index => index.name === 'ip_1' && index.unique)
  const existingVisitorIdIndex = indexes.find(index => index.name === 'visitorId_1')

  // 当前生产结构已经完成迁移时直接返回，避免再次扫描访问统计集合。
  if (!legacyIpIndex && existingVisitorIdIndex?.unique) {
    console.log('访问者索引已是最新结构，跳过数据扫描')
    return
  }

  const missingVisitorIds = collection.find({
    $or: [
      { visitorId: { $exists: false } },
      { visitorId: null },
      { visitorId: '' },
    ],
  }, {
    projection: { _id: 1, ip: 1, deviceType: 1, os: 1, browser: 1 },
  }).batchSize(25)

  for await (const visitor of missingVisitorIds) {
    const fallbackIp = typeof visitor.ip === 'string' && visitor.ip.trim()
      ? visitor.ip.trim()
      : `legacy-${visitor._id.toString()}`
    const baseVisitorId = [
      fallbackIp,
      visitor.deviceType || 'unknown',
      visitor.os || 'unknown',
      visitor.browser || 'unknown',
    ].join('_')
    const conflict = await collection.findOne({ visitorId: baseVisitorId, _id: { $ne: visitor._id } }, { projection: { _id: 1 } })
    const visitorId = conflict ? `${baseVisitorId}_${visitor._id.toString()}` : baseVisitorId
    await collection.updateOne({ _id: visitor._id }, { $set: { visitorId } })
  }

  const duplicateVisitorIds = collection.aggregate([
    { $match: { visitorId: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$visitorId', ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ], { allowDiskUse: true, batchSize: 25 })
  for await (const duplicate of duplicateVisitorIds) {
    for (const duplicateId of duplicate.ids.slice(1)) {
      await collection.updateOne(
        { _id: duplicateId },
        { $set: { visitorId: `${duplicate._id}_${duplicateId.toString()}` } },
      )
    }
  }

  if (legacyIpIndex?.name) await collection.dropIndex(legacyIpIndex.name)
  indexes = await collection.indexes()
  const visitorIdIndex = indexes.find(index => index.name === 'visitorId_1')
  if (visitorIdIndex && !visitorIdIndex.unique) {
    await collection.dropIndex('visitorId_1')
  }
  if (!visitorIdIndex?.unique) {
    await collection.createIndex({ visitorId: 1 }, { unique: true, name: 'visitorId_1' })
  }
}

export async function down(): Promise<void> {
  // Multiple devices may share one IP after this migration. Recreating the
  // legacy unique IP index could reject valid production data.
  console.log('Visitor index rollback skipped to preserve multi-device visitor data')
}
