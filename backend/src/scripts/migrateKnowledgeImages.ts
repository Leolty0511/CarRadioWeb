/**
 * 一次性知识库图片迁移工具。
 *
 * 默认只检查数据，不会上传或修改数据库。
 * 正式执行：
 *   node dist/scripts/migrateKnowledgeImages.js --apply
 *
 * 如需在确认新图无误后删除旧文件，再额外传入：
 *   --delete-originals
 *
 * 该脚本只处理知识库模型中的图片字段，不会扫描或修改其他业务图片。
 */

import dotenv from 'dotenv'
import path from 'path'
import mongoose from 'mongoose'
import {
  uploadKnowledgeImage,
  getKeyFromImageUrl,
  getStorageService,
} from '../services/uploadService'
import { CANBoxType } from '../models/CANBoxType'
import { CANBusSetting } from '../models/CANBusSetting'
import { HeadUnitType } from '../models/HeadUnitType'
import {
  GeneralDocument,
  StructuredArticle,
  VideoTutorial,
} from '../models/Document'
import { createLogger } from '../utils/logger'

dotenv.config({ path: path.join(__dirname, '../../config.env') })
dotenv.config()

const logger = createLogger('knowledge-image-migration')

type JsonValue = JsonValue[] | { [key: string]: JsonValue } | string | number | boolean | null

const applyChanges = process.argv.includes('--apply')
const deleteOriginals = process.argv.includes('--delete-originals')
const urlMap = new Map<string, string>()
const sourceReferences = new Map<string, number>()

const isKnowledgeOptimizedUrl = (url: string): boolean =>
  /\/images\/knowledge\/[^/?#]+\.webp(?:[?#]|$)/i.test(url)

const collectUrlsFromValue = (value: unknown): void => {
  if (typeof value === 'string') {
    if (/^(https?:\/\/|\/)/i.test(value) && /\.(?:jpe?g|png|webp|gif|bmp)(?:[?#]|$)/i.test(value)) {
      sourceReferences.set(value, (sourceReferences.get(value) || 0) + 1)
    }
    const htmlImagePattern = /<img[^>]+src=["']([^"']+)["']/gi
    let match: RegExpExecArray | null
    while ((match = htmlImagePattern.exec(value))) {
      collectUrlsFromValue(match[1])
    }
    return
  }

  if (Array.isArray(value)) {
    value.forEach(collectUrlsFromValue)
    return
  }

  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(collectUrlsFromValue)
  }
}

const replaceUrlsInText = (value: string): string => {
  let next = value
  for (const [source, target] of urlMap) {
    next = next.split(source).join(target)
  }
  return next
}

const replaceUrlsInValue = (value: any): any => {
  if (typeof value === 'string') return replaceUrlsInText(value)
  if (Array.isArray(value)) return value.map(replaceUrlsInValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, replaceUrlsInValue(nested)]),
    )
  }
  return value
}

const processSourceUrl = async (sourceUrl: string): Promise<void> => {
  if (urlMap.has(sourceUrl) || isKnowledgeOptimizedUrl(sourceUrl)) return

  if (!applyChanges) {
    logger.info({ sourceUrl }, '待迁移知识库图片')
    return
  }

  try {
    const key = await getKeyFromImageUrl(sourceUrl)
    const storageService = await getStorageService()
    const buffer = await storageService.downloadFile(key)
    const originalName = key.split('/').pop() || 'knowledge-image'

    const result = await uploadKnowledgeImage(buffer, originalName)
    if (!result.success || !result.url) {
      throw new Error(result.error || '图片转换失败')
    }

    urlMap.set(sourceUrl, result.url)
    logger.info({
      sourceUrl,
      targetUrl: result.url,
      thumbnailUrl: result.thumbnailUrl,
    }, '知识库图片转换完成')
  } catch (error) {
    logger.warn({
      sourceUrl,
      error: error instanceof Error ? error.message : String(error),
    }, '跳过无法读取的知识库图片')
  }
}

const collectDocuments = async (): Promise<Array<{ model: any; doc: any; fields: string[] }>> => {
  const records: Array<{ model: any; doc: any; fields: string[] }> = []

  for await (const doc of CANBoxType.find().cursor()) {
    records.push({ model: CANBoxType, doc, fields: ['image'] })
  }
  for await (const doc of HeadUnitType.find().cursor()) {
    records.push({ model: HeadUnitType, doc, fields: ['image', 'images'] })
  }
  for await (const doc of CANBusSetting.find().cursor()) {
    records.push({ model: CANBusSetting, doc, fields: ['settingImage', 'settingImages'] })
  }
  for await (const doc of GeneralDocument.find().cursor()) {
    records.push({ model: GeneralDocument, doc, fields: ['images', 'sections', 'content'] })
  }
  for await (const doc of VideoTutorial.find().cursor()) {
    records.push({ model: VideoTutorial, doc, fields: ['thumbnail', 'content'] })
  }
  for await (const doc of StructuredArticle.find().cursor()) {
    records.push({
      model: StructuredArticle,
      doc,
      fields: [
        'basicInfo',
        'tutorialSections',
        'compatibleModels',
        'incompatibleModels',
        'faqs',
      ],
    })
  }

  return records
}

const updateRecord = async (record: { model: any; doc: any; fields: string[] }): Promise<boolean> => {
  if (!applyChanges) return false

  const plain = record.doc.toObject({ depopulate: true })
  const update: Record<string, unknown> = {}
  for (const field of record.fields) {
    if (plain[field] === undefined) continue
    const replaced = replaceUrlsInValue(plain[field])
    if (JSON.stringify(replaced) !== JSON.stringify(plain[field])) {
      update[field] = replaced
    }
  }

  if (Object.keys(update).length === 0) return false
  await record.model.updateOne({ _id: record.doc._id }, { $set: update })
  return true
}

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/official-website'
  await mongoose.connect(mongoUri)

  const records = await collectDocuments()
  records.forEach(record => record.fields.forEach(field => collectUrlsFromValue(record.doc.get(field))))

  logger.info({
    records: records.length,
    images: sourceReferences.size,
    mode: applyChanges ? 'apply' : 'dry-run',
  }, '开始知识库图片迁移')

  if (!applyChanges) {
    logger.info('这是检查模式。确认数量后使用 --apply 执行转换。')
    return
  }

  for (const sourceUrl of sourceReferences.keys()) {
    await processSourceUrl(sourceUrl)
  }

  let updatedRecords = 0
  for (const record of records) {
    if (await updateRecord(record)) updatedRecords += 1
  }

  if (deleteOriginals) {
    const storageService = await getStorageService()
    for (const sourceUrl of urlMap.keys()) {
      try {
        const key = await getKeyFromImageUrl(sourceUrl)
        await storageService.deleteFile(key)
      } catch (error) {
        logger.warn({ sourceUrl, error }, '旧图片删除失败，请保留并手动核对')
      }
    }
  }

  logger.info({
    sourceImages: sourceReferences.size,
    convertedImages: urlMap.size,
    updatedRecords,
    deletedOriginals: deleteOriginals ? urlMap.size : 0,
  }, '知识库图片迁移完成')
}

main()
  .catch(error => {
    logger.error({ error }, '知识库图片迁移失败')
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => undefined)
  })
