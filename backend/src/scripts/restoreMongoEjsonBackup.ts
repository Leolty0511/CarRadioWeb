import { createReadStream } from 'fs'
import { createGunzip } from 'zlib'
import { createInterface } from 'readline'
import path from 'path'
import dotenv from 'dotenv'
import mongoose from 'mongoose'

dotenv.config({ path: path.join(__dirname, '../../config.env') })

interface MongoBackupDocument {
  _id?: unknown
  [key: string]: unknown
}

interface MongoBackupIndex extends MongoBackupDocument {
  key: MongoBackupDocument
  name?: string
  ns?: string
  v?: number
}

interface BackupRow {
  type: 'manifest' | 'collection' | 'document'
  format?: string
  collection?: string
  document?: MongoBackupDocument
  indexes?: MongoBackupIndex[]
}

async function main(): Promise<void> {
  const backupPath = process.argv[2]
  const uri = process.env.MONGODB_URI?.trim()
  if (!backupPath) throw new Error('请指定 mongodb.ejson.ndjson.gz 备份文件路径')
  if (!uri) throw new Error('MONGODB_URI 未配置')

  const client = new mongoose.mongo.MongoClient(uri)
  await client.connect()
  const db = client.db()
  const pending = new Map<string, MongoBackupDocument[]>()
  const pendingIndexes = new Map<string, MongoBackupIndex[]>()
  let restored = 0
  let manifestSeen = false

  const flush = async (collectionName: string): Promise<void> => {
    const documents = pending.get(collectionName) || []
    if (documents.length === 0) return
    const collection = db.collection<MongoBackupDocument>(collectionName)
    await collection.bulkWrite(documents.map(document => ({
      replaceOne: {
        filter: { _id: document._id } as Parameters<typeof collection.findOne>[0],
        replacement: document,
        upsert: true,
      },
    })), { ordered: false })
    restored += documents.length
    pending.set(collectionName, [])
  }

  try {
    const lines = createInterface({ input: createReadStream(backupPath).pipe(createGunzip()), crlfDelay: Infinity })
    for await (const line of lines) {
      if (!line.trim()) continue
      const row = mongoose.mongo.BSON.EJSON.parse(line, { relaxed: false }) as BackupRow
      if (!manifestSeen) {
        if (row.type !== 'manifest' || row.format !== 'carradioweb-mongodb-ejson-v1') throw new Error('不支持的 MongoDB 备份格式')
        manifestSeen = true
        continue
      }
      if (row.type === 'collection' && row.collection) {
        pendingIndexes.set(row.collection, row.indexes || [])
        continue
      }
      if (row.type !== 'document' || !row.collection || !row.document || !('_id' in row.document)) continue
      const documents = pending.get(row.collection) || []
      documents.push(row.document)
      pending.set(row.collection, documents)
      if (documents.length >= 500) await flush(row.collection)
    }
    if (!manifestSeen) throw new Error('MongoDB 备份文件缺少格式清单')
    for (const collectionName of pending.keys()) await flush(collectionName)
    let restoredIndexes = 0
    for (const [collectionName, indexes] of pendingIndexes) {
      const definitions = indexes
        .filter(index => index.name !== '_id_' && index.key && typeof index.key === 'object' && !Array.isArray(index.key))
        .map(index => {
          const definition = { ...index }
          delete definition.v
          delete definition.ns
          return definition
        })
      if (definitions.length === 0) continue
      const collection = db.collection<MongoBackupDocument>(collectionName)
      await collection.createIndexes(definitions as unknown as Parameters<typeof collection.createIndexes>[0])
      restoredIndexes += definitions.length
    }
    console.log(`MongoDB 恢复完成：写入 ${restored} 条记录，恢复 ${restoredIndexes} 个索引`)
  } finally {
    await client.close()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
