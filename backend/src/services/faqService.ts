/**
 * FAQ Service — CRUD operations for FAQ items
 */

import FAQ, { IFAQ } from '../models/FAQ';
import { createLogger } from '../utils/logger';

const logger = createLogger('faq-service');

class FAQService {
  /**
   * Get published FAQs for public display
   */
  async getPublishedFAQs(language: string): Promise<IFAQ[]> {
    const faqs = await FAQ.find({ language, published: true })
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();
    return faqs as unknown as IFAQ[];
  }

  /**
   * Get all FAQs (admin, includes unpublished)
   */
  async getAllFAQs(language: string): Promise<IFAQ[]> {
    const faqs = await FAQ.find({ language })
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();
    return faqs as unknown as IFAQ[];
  }

  /**
   * Get single FAQ by ID
   */
  async getFAQById(id: string): Promise<IFAQ | null> {
    return FAQ.findById(id).lean() as unknown as Promise<IFAQ | null>;
  }

  /**
   * Create a new FAQ
   */
  async createFAQ(data: Partial<IFAQ>): Promise<IFAQ> {
    const faq = new FAQ(data);
    const saved = await faq.save();
    logger.info({ id: saved._id }, 'FAQ created');
    return saved;
  }

  /**
   * Update an existing FAQ
   */
  async updateFAQ(id: string, data: Partial<IFAQ>): Promise<IFAQ | null> {
    const faq = await FAQ.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).lean();
    if (faq) {
      logger.info({ id }, 'FAQ updated');
    }
    return faq as unknown as IFAQ | null;
  }

  /**
   * Delete a FAQ
   */
  async deleteFAQ(id: string): Promise<boolean> {
    const result = await FAQ.deleteOne({ _id: id });
    if (result.deletedCount > 0) {
      logger.info({ id }, 'FAQ deleted');
      return true;
    }
    return false;
  }

  /**
   * Get distinct categories for a language
   */
  async getCategories(language: string): Promise<string[]> {
    return FAQ.distinct('category', { language });
  }

  async exportFAQs(language: string = 'en') {
    const faqs = await this.getAllFAQs(language);
    return faqs.map((faq) => ({
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      sortOrder: faq.sortOrder,
      published: faq.published,
      language: 'en',
    }));
  }

  async importFAQs(
    items: Array<{ question?: string; answer?: string; category?: string; sortOrder?: number; published?: boolean }>,
    mode: 'merge' | 'replace' = 'merge'
  ): Promise<{ imported: number; skipped: number }> {
    const language = 'en';
    const cleaned = items
      .map((item, index) => ({
        question: String(item.question || '').trim(),
        answer: String(item.answer || '').trim(),
        category: String(item.category || 'general').trim() || 'general',
        sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index + 1,
        published: item.published !== false,
        language,
      }))
      .filter((item) => item.question && item.answer);

    if (mode === 'replace') {
      await FAQ.deleteMany({ language });
    }

    let imported = 0;
    for (const item of cleaned) {
      await FAQ.findOneAndUpdate(
        { language, question: item.question },
        item,
        { upsert: true, new: true, runValidators: true }
      );
      imported += 1;
    }

    logger.info({ imported, skipped: items.length - cleaned.length, mode }, 'FAQ import completed');
    return { imported, skipped: items.length - cleaned.length };
  }
}

export default new FAQService();
