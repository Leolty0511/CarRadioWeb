import { CANBoxType, ICANBoxType } from '../models/CANBoxType'
import { CANBusSetting, ICANBusSetting } from '../models/CANBusSetting'
import { Types } from 'mongoose'
import { ModuleSettings } from '../models/ModuleSettings'

interface CANBoxTypeInput {
  name: string
  image: string
  sortOrder?: number
  isActive?: boolean
}

interface CANBusSettingInput {
  vehicleId: string
  settingImage?: string
  settingImages?: string[]
  description?: string
  isActive?: boolean
}

function normalizeSettingImages(data: { settingImage?: string; settingImages?: string[] }): string[] {
  const images = [
    ...(Array.isArray(data.settingImages) ? data.settingImages : []),
    data.settingImage || '',
  ]
    .map(item => String(item || '').trim())
    .filter(Boolean)
  return [...new Set(images)]
}

interface PopulatedSetting extends Omit<ICANBusSetting, 'vehicleId'> {
  vehicleId: {
    _id: Types.ObjectId
    brand: string
    modelName: string
    year: string
  }
}

class CANBusSettingsService {
  // ==================== CANBox 类型管理 ====================

  async getAllCANBoxTypes(activeOnly = false): Promise<ICANBoxType[]> {
    const filter = activeOnly ? { isActive: true } : {}
    return CANBoxType.find(filter).sort({ sortOrder: 1, name: 1 })
  }

  async getCANBoxTypeById(id: string): Promise<ICANBoxType | null> {
    return CANBoxType.findById(id)
  }

  async createCANBoxType(data: CANBoxTypeInput): Promise<ICANBoxType> {
    const canboxType = new CANBoxType(data)
    return canboxType.save()
  }

  async updateCANBoxType(id: string, data: Partial<CANBoxTypeInput>): Promise<ICANBoxType | null> {
    return CANBoxType.findByIdAndUpdate(id, data, { new: true })
  }

  async deleteCANBoxType(id: string): Promise<boolean> {
    // 检查是否有关联的设置
    const settingsCount = await CANBusSetting.countDocuments({ canboxTypeId: id })
    if (settingsCount > 0) {
      throw new Error(`Cannot delete: ${settingsCount} settings are using this CANBox type`)
    }
    const result = await CANBoxType.findByIdAndDelete(id)
    return !!result
  }

  // ==================== CANBus 设置管理 ====================

  async getAllSettings(filters?: {
    vehicleId?: string
    isActive?: boolean
  }): Promise<PopulatedSetting[]> {
    const query: Record<string, unknown> = {}
    
    if (filters?.vehicleId) {
      query.vehicleId = new Types.ObjectId(filters.vehicleId)
    }
    if (filters?.isActive !== undefined) {
      query.isActive = filters.isActive
    }

    return CANBusSetting.find(query)
      .populate('vehicleId', 'brand modelName year')
      .sort({ createdAt: -1 }) as unknown as Promise<PopulatedSetting[]>
  }

  async getSettingById(id: string): Promise<PopulatedSetting | null> {
    return CANBusSetting.findById(id)
      .populate('vehicleId', 'brand modelName year') as unknown as Promise<PopulatedSetting | null>
  }

  async createSetting(data: CANBusSettingInput): Promise<ICANBusSetting> {
    const settingImages = normalizeSettingImages(data)
    const setting = new CANBusSetting({
      vehicleId: new Types.ObjectId(data.vehicleId),
      settingImage: settingImages[0] || '',
      settingImages,
      description: data.description || '',
      isActive: data.isActive ?? true
    })
    return setting.save()
  }

  async updateSetting(id: string, data: Partial<CANBusSettingInput>): Promise<ICANBusSetting | null> {
    const updateData: Record<string, unknown> = {}
    
    if (data.vehicleId) {
      updateData.vehicleId = new Types.ObjectId(data.vehicleId)
    }
    if (data.settingImage !== undefined || data.settingImages !== undefined) {
      const settingImages = normalizeSettingImages({
        settingImage: data.settingImage,
        settingImages: data.settingImages,
      })
      updateData.settingImage = settingImages[0] || ''
      updateData.settingImages = settingImages
    }
    if (data.description !== undefined) {
      updateData.description = data.description
    }
    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive
    }

    return CANBusSetting.findByIdAndUpdate(id, updateData, { new: true })
  }

  async deleteSetting(id: string): Promise<boolean> {
    const result = await CANBusSetting.findByIdAndDelete(id)
    return !!result
  }

  // ==================== 前台查询接口 ====================

  /**
   * 根据车型获取设置信息
   * @param vehicleId 车型 ID
   */
  async getSettingByVehicle(vehicleId: string): Promise<{ settingImage: string; description: string } | null> {
    const setting = await CANBusSetting.findOne({
      vehicleId: new Types.ObjectId(vehicleId),
      isActive: true
    })
    if (!setting) return null
    const settingImages = normalizeSettingImages({
      settingImage: setting.settingImage,
      settingImages: setting.settingImages,
    })
    return {
      settingImage: settingImages[0] || '',
      settingImages,
      description: setting.description
    }
  }

  async getPageIntro(): Promise<{ en: string; zh: string }> {
    const moduleSettings = await ModuleSettings.findOne().lean()
    const settings = (moduleSettings?.knowledgeBase as { settings?: Record<string, unknown> } | undefined)?.settings
    return {
      en: typeof settings?.canbusIntroEn === 'string' ? settings.canbusIntroEn : '',
      zh: typeof settings?.canbusIntroZh === 'string' ? settings.canbusIntroZh : '',
    }
  }

  async updatePageIntro(intro: { en?: string; zh?: string }): Promise<{ en: string; zh: string }> {
    const current = await this.getPageIntro()
    const next = {
      en: intro.en !== undefined ? String(intro.en) : current.en,
      zh: intro.zh !== undefined ? String(intro.zh) : current.zh,
    }
    const existing = await ModuleSettings.findOne()
    if (!existing) {
      await ModuleSettings.create({
        knowledgeBase: { settings: { canbusIntroEn: next.en, canbusIntroZh: next.zh } },
      })
      return next
    }
    const knowledgeBase = (existing.knowledgeBase && typeof existing.knowledgeBase === 'object')
      ? { ...existing.knowledgeBase as Record<string, unknown> }
      : {}
    const settings = (knowledgeBase.settings && typeof knowledgeBase.settings === 'object')
      ? { ...knowledgeBase.settings as Record<string, unknown> }
      : {}
    settings.canbusIntroEn = next.en
    settings.canbusIntroZh = next.zh
    knowledgeBase.settings = settings
    existing.knowledgeBase = knowledgeBase
    existing.markModified('knowledgeBase')
    await existing.save()
    return next
  }
}

export const canbusSettingsService = new CANBusSettingsService()
export default canbusSettingsService
