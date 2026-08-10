import express, { Request, Response } from 'express'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import multer from 'multer'
import mongoose from 'mongoose'
import { authenticateUser, requireAnyPermission, requirePermission } from '../middleware/auth'
import { PERMISSIONS } from '../config/permissions'
import ManualCategory from '../models/ManualCategory'
import UserManual from '../models/UserManual'
import logger from '../utils/logger'

const router = express.Router()
const PDF_DIR = process.env.MANUAL_STORAGE_DIR
  ? path.resolve(process.env.MANUAL_STORAGE_DIR)
  : path.join(process.cwd(), 'private', 'user-manuals')
const LEGACY_PDF_DIR = path.join(__dirname, '../../../public/PDF')
const MAX_FILE_SIZE = 50 * 1024 * 1024

if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PDF_DIR),
  filename: (_req, file, cb) => cb(null, file.originalname.replace(/[^a-zA-Z0-9\u4e00-\u9fa5._()-]/g, '_')),
})
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => cb(null, path.extname(file.originalname).toLowerCase() === '.pdf'),
})

function slugify(value: string) {
  const slug = value.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return slug || `manual-category-${Date.now()}`
}

async function getUncategorizedCategory() {
  let category = await ManualCategory.findOne({ slug: 'uncategorized' })
  if (!category) category = await ManualCategory.create({ name: '未分类', slug: 'uncategorized', order: 9999, isActive: true })
  return category
}

/** Register PDF files that pre-date the metadata model without changing their URLs. */
async function syncLegacyFiles() {
  if (fs.existsSync(LEGACY_PDF_DIR) && path.resolve(LEGACY_PDF_DIR) !== path.resolve(PDF_DIR)) {
    for (const file of await fsp.readdir(LEGACY_PDF_DIR)) {
      if (path.extname(file).toLowerCase() !== '.pdf') continue
      const source = path.join(LEGACY_PDF_DIR, file)
      const target = path.join(PDF_DIR, file)
      if (!fs.existsSync(target)) await fsp.rename(source, target).catch(() => undefined)
    }
  }
  const category = await getUncategorizedCategory()
  const files = (await fsp.readdir(PDF_DIR)).filter(file => path.extname(file).toLowerCase() === '.pdf')
  for (const filename of files) {
    const exists = await UserManual.exists({ filename })
    if (exists) continue
    const stats = await fsp.stat(path.join(PDF_DIR, filename))
    const base = filename.replace(/\.pdf$/i, '')
    await UserManual.create({ filename, title: base, productModel: base, categoryId: category._id, size: stats.size })
  }
}

function serializeManual(manual: any) {
  const value = manual.toObject ? manual.toObject() : manual
  return {
    ...value,
    id: String(value._id),
    name: value.filename,
    sizeFormatted: formatFileSize(value.size || 0),
    url: `/api/user-manual/view/${encodeURIComponent(value.filename)}`,
    downloadUrl: `/api/user-manual/download/${encodeURIComponent(value.filename)}`,
    categoryId: value.categoryId ? String(value.categoryId._id || value.categoryId) : null,
    category: value.categoryId && typeof value.categoryId === 'object' ? value.categoryId : undefined,
  }
}

async function listCategories(includeEmpty = false) {
  const categories = await ManualCategory.find({ ...(includeEmpty ? {} : { isActive: true }) }).sort({ order: 1, name: 1 }).lean()
  if (includeEmpty) return categories
  const counts = await UserManual.aggregate([{ $match: { isPublished: true } }, { $group: { _id: '$categoryId', count: { $sum: 1 } } }])
  const countMap = new Map(counts.map(item => [String(item._id), item.count]))
  return categories.map(category => ({ ...category, manualCount: countMap.get(String(category._id)) || 0 })).filter(category => category.manualCount > 0)
}

router.get('/categories', async (_req, res) => {
  try {
    await syncLegacyFiles()
    res.json({ success: true, categories: await listCategories(false) })
  } catch (error) {
    logger.error({ error }, 'Failed to list manual categories')
    res.status(500).json({ success: false, message: '获取用户手册分类失败' })
  }
})

router.get('/', async (req, res) => {
  try {
    await syncLegacyFiles()
    const filter: Record<string, any> = { isPublished: true }
    if (req.query.categoryId && mongoose.isValidObjectId(req.query.categoryId)) filter.categoryId = req.query.categoryId
    const manuals = await UserManual.find(filter).populate('categoryId', 'name slug description').sort({ sortOrder: 1, updatedAt: -1 }).lean()
    res.json({ success: true, manuals: manuals.map(serializeManual) })
  } catch (error) {
    logger.error({ error }, 'Failed to list user manuals')
    res.status(500).json({ success: false, message: '获取用户手册失败' })
  }
})

router.get('/admin', authenticateUser, requireAnyPermission(PERMISSIONS.resources.read, PERMISSIONS.resources.create, PERMISSIONS.resources.update, PERMISSIONS.resources.delete), async (_req, res) => {
  try {
    await syncLegacyFiles()
    const [manuals, categories] = await Promise.all([
      UserManual.find().populate('categoryId', 'name slug description').sort({ sortOrder: 1, updatedAt: -1 }).lean(),
      listCategories(true),
    ])
    res.json({ success: true, manuals: manuals.map(serializeManual), categories })
  } catch (error) {
    logger.error({ error }, 'Failed to list manuals for admin')
    res.status(500).json({ success: false, message: '获取用户手册管理数据失败' })
  }
})

router.post('/categories', authenticateUser, requireAnyPermission(PERMISSIONS.resources.create, PERMISSIONS.resources.update), async (req: Request, res: Response) => {
  try {
    const name = String(req.body.name || '').trim()
    if (!name) return res.status(400).json({ success: false, message: '分类名称不能为空' })
    const category = await ManualCategory.create({ name, slug: `${slugify(name)}-${Date.now().toString(36)}`, description: String(req.body.description || ''), order: Number(req.body.order) || 0, isActive: req.body.isActive !== false, createdBy: req.user?._id })
    res.status(201).json({ success: true, category })
  } catch (error: any) {
    logger.error({ error }, 'Failed to create manual category')
    res.status(error?.code === 11000 ? 409 : 500).json({ success: false, message: error?.code === 11000 ? '分类已存在' : '创建分类失败' })
  }
})

router.put('/categories/:id', authenticateUser, requireAnyPermission(PERMISSIONS.resources.update), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: '无效的分类 ID' })
    const updates: Record<string, any> = {}
    if (req.body.name !== undefined) updates.name = String(req.body.name).trim()
    if (req.body.description !== undefined) updates.description = String(req.body.description)
    if (req.body.order !== undefined) updates.order = Number(req.body.order) || 0
    if (req.body.isActive !== undefined) updates.isActive = Boolean(req.body.isActive)
    const category = await ManualCategory.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
    if (!category) return res.status(404).json({ success: false, message: '分类不存在' })
    res.json({ success: true, category })
  } catch (error) {
    res.status(500).json({ success: false, message: '更新分类失败' })
  }
})

router.delete('/categories/:id', authenticateUser, requirePermission(PERMISSIONS.resources.delete), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: '无效的分类 ID' })
    const fallback = await getUncategorizedCategory()
    if (String(fallback._id) === req.params.id) return res.status(400).json({ success: false, message: '未分类不能删除' })
    const category = await ManualCategory.findByIdAndDelete(req.params.id)
    if (!category) return res.status(404).json({ success: false, message: '分类不存在' })
    await UserManual.updateMany({ categoryId: category._id }, { categoryId: fallback._id })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ success: false, message: '删除分类失败' })
  }
})

router.post('/upload', authenticateUser, requireAnyPermission(PERMISSIONS.resources.create, PERMISSIONS.resources.update), upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '请选择要上传的 PDF 文件' })
    const title = String(req.body.title || req.file.originalname.replace(/\.pdf$/i, '')).trim()
    const productModel = String(req.body.productModel || title).trim()
    if (!title || !productModel) {
      await fsp.unlink(req.file.path).catch(() => undefined)
      return res.status(400).json({ success: false, message: '请填写手册标题和产品型号' })
    }
    const categoryId = req.body.categoryId && mongoose.isValidObjectId(req.body.categoryId) ? req.body.categoryId : (await getUncategorizedCategory())._id
    const existing = await UserManual.findOne({ filename: req.file.filename })
    if (existing) await UserManual.deleteOne({ _id: existing._id })
    const manual = await UserManual.create({ filename: req.file.filename, title, productModel, categoryId, description: String(req.body.description || ''), version: String(req.body.version || ''), sortOrder: Number(req.body.sortOrder) || 0, isPublished: req.body.isPublished !== 'false', size: req.file.size })
    res.status(201).json({ success: true, manual: serializeManual(manual) })
  } catch (error) {
    if (req.file) await fsp.unlink(req.file.path).catch(() => undefined)
    logger.error({ error }, 'Failed to upload user manual')
    res.status(500).json({ success: false, message: '上传失败' })
  }
})

router.put('/:id', authenticateUser, requireAnyPermission(PERMISSIONS.resources.update), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: '无效的手册 ID' })
    const updates: Record<string, any> = {}
    for (const key of ['title', 'productModel', 'description', 'version']) if (req.body[key] !== undefined) updates[key] = String(req.body[key]).trim()
    if (req.body.categoryId !== undefined) updates.categoryId = mongoose.isValidObjectId(req.body.categoryId) ? req.body.categoryId : (await getUncategorizedCategory())._id
    if (req.body.sortOrder !== undefined) updates.sortOrder = Number(req.body.sortOrder) || 0
    if (req.body.isPublished !== undefined) updates.isPublished = Boolean(req.body.isPublished)
    const manual = await UserManual.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).populate('categoryId', 'name slug description')
    if (!manual) return res.status(404).json({ success: false, message: '手册不存在' })
    res.json({ success: true, manual: serializeManual(manual) })
  } catch (error) {
    res.status(500).json({ success: false, message: '更新手册失败' })
  }
})

router.delete('/:id', authenticateUser, requirePermission(PERMISSIONS.resources.delete), async (req, res) => {
  try {
    const manual = mongoose.isValidObjectId(req.params.id) ? await UserManual.findById(req.params.id) : await UserManual.findOne({ filename: req.params.id })
    if (!manual) return res.status(404).json({ success: false, message: '手册不存在' })
    await UserManual.deleteOne({ _id: manual._id })
    await fsp.unlink(path.join(PDF_DIR, manual.filename)).catch(() => undefined)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ success: false, message: '删除手册失败' })
  }
})

async function sendFile(req: Request, res: Response, disposition: 'inline' | 'attachment') {
  const filename = decodeURIComponent(req.params.filename)
  const filePath = path.resolve(PDF_DIR, filename)
  if (!filePath.startsWith(`${path.resolve(PDF_DIR)}${path.sep}`)) return res.status(403).json({ success: false, message: '无效的文件路径' })
  try {
    const stats = await fsp.stat(filePath)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Length', stats.size)
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(filename)}"`)
    res.setHeader('Accept-Ranges', 'bytes')
    fs.createReadStream(filePath).pipe(res)
  } catch {
    res.status(404).json({ success: false, message: '文件不存在' })
  }
}

router.get('/view/:filename', (req, res) => sendFile(req, res, 'inline'))
router.get('/download/:filename', (req, res) => sendFile(req, res, 'attachment'))

function formatFileSize(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${parseFloat((bytes / Math.pow(1024, index)).toFixed(2))} ${units[index]}`
}

export default router
