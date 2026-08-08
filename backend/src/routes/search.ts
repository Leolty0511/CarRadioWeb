/**
 * Global Search API Route
 * Search across products, documents, FAQ, software, and user manuals
 */

import { Router, Request, Response } from 'express'
import fsp from 'fs/promises'
import path from 'path'
import Product from '../models/Product'
import Document from '../models/Document'
import Software from '../models/Software'
import logger from '../utils/logger'
import { optionalContentAccess } from '../middleware/contentAccess'

const router = Router()

const MAX_RESULTS_PER_TYPE = 5
const MIN_QUERY_LENGTH = 2

// PDF directory for user manuals
const PDF_DIR = process.env.MANUAL_STORAGE_DIR
  ? path.resolve(process.env.MANUAL_STORAGE_DIR)
  : path.join(process.cwd(), 'private', 'user-manuals')

type SearchResultType = 'product' | 'document' | 'faq' | 'software' | 'manual'

interface SearchResult {
  type: SearchResultType
  id: string
  title: string
  description?: string
  url: string
  image?: string
}

interface SearchResponse {
  results: SearchResult[]
  total: number
  query: string
}

/**
 * Search user manual PDF files
 */
async function searchUserManuals(searchRegex: RegExp): Promise<SearchResult[]> {
  const results: SearchResult[] = []

  try {
    const files = await fsp.readdir(PDF_DIR)
    const pdfFiles = files.filter(file =>
      path.extname(file).toLowerCase() === '.pdf' &&
      searchRegex.test(file)
    )

    pdfFiles.slice(0, MAX_RESULTS_PER_TYPE).forEach(file => {
      results.push({
        type: 'manual',
        id: `manual-${file}`,
        title: file.replace('.pdf', ''),
        description: 'PDF User Manual',
        url: '/user-manual'
      })
    })
  } catch (error) {
    // 目录不存在或不可读时静默返回空结果
    logger.warn({ error }, 'Failed to search user manuals')
  }

  return results
}

/**
 * GET /api/search
 * Global search endpoint
 */
router.get('/', optionalContentAccess, async (req: Request, res: Response) => {
  try {
    const { q, lang: langParam = 'en' } = req.query
    const lang = String(langParam)
    const query = String(q || '').trim()

    if (query.length < MIN_QUERY_LENGTH) {
      return res.json({ results: [], total: 0, query })
    }

    // Escape special regex characters to prevent ReDoS attacks
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const searchRegex = new RegExp(escapedQuery, 'i')
    const results: SearchResult[] = []

    // Search products
    const products = await Product.find({
      $or: [
        { [`name.${lang}`]: searchRegex },
        { [`description.${lang}`]: searchRegex }
      ],
      isActive: true
    })
      .limit(MAX_RESULTS_PER_TYPE)
      .select('name description slug images')
      .lean()

    products.forEach((product) => {
      const typedProduct = product as unknown as {
        _id: unknown
        name?: Record<string, string>
        description?: Record<string, string>
        slug?: string
        images?: string[]
      }
      results.push({
        type: 'product',
        id: String(typedProduct._id),
        title: typedProduct.name?.[lang] || typedProduct.name?.en || '',
        description: typedProduct.description?.[lang] || typedProduct.description?.en || '',
        url: `/products/${typedProduct.slug}`,
        image: typedProduct.images?.[0]
      })
    })

    // Documents, FAQs, software and manuals are visible only to a member/admin.
    if (req.contentPrincipal) {
    // Search documents (general and video tutorials)
    const documents = await Document.find({
      $or: [
        { title: searchRegex },
        { content: searchRegex },
        { summary: searchRegex },
        { description: searchRegex },
        { category: searchRegex },
      ],
      status: 'published',
      documentType: { $in: ['general', 'video'] }
    })
      .limit(MAX_RESULTS_PER_TYPE)
      .select('title documentType slug thumbnail vehicleImage basicInfo')
      .lean()

    documents.forEach((doc) => {
      const typedDoc = doc as unknown as {
        _id: unknown
        title?: string | Record<string, string>
        documentType?: string
        slug?: string
        thumbnail?: string
        vehicleImage?: string
        basicInfo?: { vehicleImage?: string }
      }
      results.push({
        type: 'document',
        id: String(typedDoc._id),
        title: typeof typedDoc.title === 'string' ? typedDoc.title : typedDoc.title?.[lang] || typedDoc.title?.en || '',
        url: `/knowledge/${typedDoc.documentType === 'video' ? 'video' : 'article'}/${typedDoc.slug || typedDoc._id}`,
        image: typedDoc.thumbnail || typedDoc.vehicleImage
      })
    })

    // Search structured documents (title match)
    const structuredDocs = await Document.find({
      $or: [
        { 'basicInfo.brand': searchRegex },
        { 'basicInfo.model': searchRegex },
        { 'basicInfo.yearRange': searchRegex },
        { title: searchRegex },
      ],
      status: 'published',
      documentType: 'structured'
    })
      .limit(MAX_RESULTS_PER_TYPE)
      .select('title slug vehicleImage basicInfo')
      .lean()

    structuredDocs.forEach((doc) => {
      const typedDoc = doc as unknown as {
        _id: unknown
        title?: string | Record<string, string>
        slug?: string
        vehicleImage?: string
        basicInfo?: { vehicleImage?: string }
      }
      results.push({
        type: 'document',
        id: String(typedDoc._id),
        title: typeof typedDoc.title === 'string' ? typedDoc.title : typedDoc.title?.[lang] || typedDoc.title?.en || '',
        url: `/knowledge/vehicle/${typedDoc.slug || typedDoc._id}`,
        image: typedDoc.vehicleImage || typedDoc.basicInfo?.vehicleImage
      })
    })

    // Search FAQ (structured documents with FAQ sections)
    const faqDocs = await Document.find({
      documentType: 'structured',
      faqs: { $exists: true, $ne: [] },
      $or: [{ 'faqs.title': searchRegex }, { 'faqs.description': searchRegex }],
      status: 'published'
    })
      .limit(MAX_RESULTS_PER_TYPE * 2)
      .select('title faqs slug')
      .lean()

    faqDocs.forEach((doc) => {
      const typedDoc = doc as unknown as {
        _id: unknown
        title?: string | Record<string, string>
        faqs?: Array<{
            id?: string
            title?: string
            description?: string
          }>
        slug?: string
      }
      const faqs = typedDoc.faqs || []
      faqs.forEach((faq, idx) => {
        const question = faq.title || ''
        if (searchRegex.test(question) || searchRegex.test(faq.description || '')) {
          results.push({
            type: 'faq',
            id: `${typedDoc._id}-faq-${idx}`,
            title: question,
            url: `/knowledge/vehicle/${typedDoc.slug || typedDoc._id}#faq-${idx}`
          })
        }
      })
    })

    // Search software downloads
    const contentLang = 'en'
    const software = await Software.find({
      $or: [
        { name: searchRegex },
        { description: searchRegex }
      ],
      language: contentLang
    })
      .limit(MAX_RESULTS_PER_TYPE)
      .select('name description')
      .lean()

    software.forEach((sw) => {
      const typedSw = sw as unknown as {
        _id: unknown
        name?: string
        description?: string
      }
      results.push({
        type: 'software',
        id: String(typedSw._id),
        title: typedSw.name || '',
        description: typedSw.description || '',
        url: '/software-downloads'
      })
    })

    // Search user manuals (PDF files)
    const manualResults = await searchUserManuals(searchRegex)
    results.push(...manualResults)
    }

    // Deduplicate by id
    const uniqueResults = results.filter((result, index, self) =>
      index === self.findIndex(r => r.id === result.id)
    )

    // Limit total results
    const limitedResults = uniqueResults.slice(0, MAX_RESULTS_PER_TYPE * 4)

    const response: SearchResponse = {
      results: limitedResults,
      total: limitedResults.length,
      query
    }

    res.json(response)
  } catch (error: unknown) {
    logger.error({ err: error }, 'Search error')
    res.status(500).json({ success: false, message: 'Search failed' })
  }
})

export default router
