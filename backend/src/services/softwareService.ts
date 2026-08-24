import SoftwareCategory, { ISoftwareCategory } from '../models/SoftwareCategory';
import Software, { ISoftware } from '../models/Software';
import mongoose from 'mongoose';
import { toContentSlug } from '../utils/contentSlug';

export class SoftwareService {
  private async ensureSoftwareSlug(software: ISoftware): Promise<ISoftware> {
    if (software.slug) return software;

    const baseSlug = toContentSlug(software.name, 'software');
    let slug = baseSlug;
    let suffix = 2;
    while (await Software.exists({ slug, _id: { $ne: software._id } })) {
      slug = `${baseSlug}-${suffix++}`;
    }
    software.slug = slug;
    await software.save();
    return software;
  }

  private async ensureSoftwareSlugs(software: ISoftware[]): Promise<ISoftware[]> {
    for (const item of software) await this.ensureSoftwareSlug(item);
    return software;
  }

  // 软件分类管理（按资料体系）
  async getAllCategories(language?: 'en' | 'ru'): Promise<ISoftwareCategory[]> {
    const filter: any = {};
    if (language) {
      filter.language = language;
    }
    return await SoftwareCategory.find(filter).sort({ order: 1, createdAt: -1 });
  }

  async createCategory(categoryData: { name: string; order?: number; language: 'en' | 'ru' }): Promise<ISoftwareCategory> {
    const category = new SoftwareCategory(categoryData);
    return await category.save();
  }

  async updateCategory(id: string, categoryData: { name?: string; order?: number; language?: 'en' | 'ru' }): Promise<ISoftwareCategory | null> {
    return await SoftwareCategory.findByIdAndUpdate(id, categoryData, { new: true });
  }

  async deleteCategory(id: string): Promise<boolean> {
    // 检查是否有软件使用此分类
    const softwareCount = await Software.countDocuments({ categoryId: id });
    if (softwareCount > 0) {
      throw new Error('Cannot delete category with existing software');
    }
    
    const result = await SoftwareCategory.findByIdAndDelete(id);
    return !!result;
  }

  // 软件管理（按资料体系）
  async getAllSoftware(language?: 'en' | 'ru', headUnitTypeId?: string): Promise<ISoftware[]> {
    const filter: any = {};
    if (language) {
      filter.language = language;
    }
    if (headUnitTypeId) {
      filter.$or = [{ headUnitTypeId }, { headUnitTypeId: { $exists: false } }, { headUnitTypeId: null }];
    }
    const software = await Software.find(filter).populate('categoryId').populate('headUnitTypeId', 'name').sort({ createdAt: -1 });
    return this.ensureSoftwareSlugs(software);
  }

  async getSoftwareByCategory(categoryId: string, language?: 'en' | 'ru', headUnitTypeId?: string): Promise<ISoftware[]> {
    const filter: any = { categoryId };
    if (language) {
      filter.language = language;
    }
    if (headUnitTypeId) {
      filter.$or = [{ headUnitTypeId }, { headUnitTypeId: { $exists: false } }, { headUnitTypeId: null }];
    }
    const software = await Software.find(filter).populate('categoryId').populate('headUnitTypeId', 'name').sort({ createdAt: -1 });
    return this.ensureSoftwareSlugs(software);
  }

  async getSoftwareById(idOrSlug: string): Promise<ISoftware | null> {
    const software = await (mongoose.isValidObjectId(idOrSlug)
      ? Software.findById(idOrSlug)
      : Software.findOne({ slug: idOrSlug }))
      .populate('categoryId')
      .populate('headUnitTypeId', 'name');
    return software ? this.ensureSoftwareSlug(software) : null;
  }

  async createSoftware(softwareData: {
    name: string;
    categoryId?: string;
    description: string;
    downloadUrl: string;
    importantNote?: string;
    headUnitTypeId?: string;
    language: 'en' | 'ru';
  }): Promise<ISoftware> {
    const baseSlug = toContentSlug(softwareData.name, 'software');
    let slug = baseSlug;
    let suffix = 2;
    while (await Software.exists({ slug })) slug = `${baseSlug}-${suffix++}`;
    const software = new Software({ ...softwareData, slug });
    return await software.save();
  }

  async updateSoftware(id: string, softwareData: {
    name?: string;
    categoryId?: string;
    description?: string;
    downloadUrl?: string;
    importantNote?: string;
    headUnitTypeId?: string;
    language?: 'en' | 'ru';
  }): Promise<ISoftware | null> {
    return await Software.findByIdAndUpdate(id, softwareData, { new: true }).populate('categoryId').populate('headUnitTypeId', 'name');
  }

  async deleteSoftware(id: string): Promise<boolean> {
    const result = await Software.findByIdAndDelete(id);
    return !!result;
  }
}

export const softwareService = new SoftwareService();
