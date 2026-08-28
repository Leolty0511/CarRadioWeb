import SiteSettings, { ISiteSettings } from '../models/SiteSettings'
import GlobalSiteSettings from '../models/GlobalSiteSettings'
import { createLogger } from '../utils/logger'
import { toExternalHref } from '../utils/externalUrl'

const logger = createLogger('site-settings')

const SOCIAL_KEYS = ['youtube', 'telegram', 'whatsapp', 'facebook', 'instagram', 'tiktok', 'vk'] as const

function normalizeSocialLinks(socialLinks: unknown) {
  if (!socialLinks || typeof socialLinks !== 'object') {
    return socialLinks
  }
  const source = socialLinks as Record<string, unknown>
  const next: Record<string, string> = { ...source } as Record<string, string>
  for (const key of SOCIAL_KEYS) {
    if (typeof source[key] === 'string') {
      next[key] = toExternalHref(source[key])
    }
  }
  return next
}


type GlobalKeys =
  | 'multiDataModeEnabled'
  | 'enableChineseUI'
  | 'dataLanguageScopes'
  | 'cookieBannerEnabled'
  | 'cookieConsentPromptVersion'
  | 'legalPrivacyPath'
  | 'legalTermsPath'
  | 'legalDisclaimerPath'
  | 'newsletterEnabled'
  | 'contactFormEmailEnabled'
  | 'contactFormEmailTo'
  | 'newsletterSmtp'

const GLOBAL_KEYS: GlobalKeys[] = [
  'multiDataModeEnabled',
  'enableChineseUI',
  'dataLanguageScopes',
  'cookieBannerEnabled',
  'cookieConsentPromptVersion',
  'legalPrivacyPath',
  'legalTermsPath',
  'legalDisclaimerPath',
  'newsletterEnabled',
  'contactFormEmailEnabled',
  'contactFormEmailTo',
  'newsletterSmtp',
]

const DEFAULT_NEWSLETTER_SMTP = {
  enabled: false,
  host: '',
  port: 465,
  secure: true,
  user: '',
  pass: '',
  from: '',
}

const DEFAULT_GLOBALS: Record<GlobalKeys, unknown> = {
  multiDataModeEnabled: false,
  enableChineseUI: true,
  dataLanguageScopes: {
    documents: true,
    announcements: true,
    heroBanners: true,
    products: true,
    vehicles: true,
    contacts: true,
    canbusSettings: true,
    moduleSettings: true,
  },
  cookieBannerEnabled: false,
  cookieConsentPromptVersion: '1',
  legalPrivacyPath: '/privacy',
  legalTermsPath: '/terms',
  legalDisclaimerPath: '/disclaimer',
  newsletterEnabled: false,
  contactFormEmailEnabled: false,
  contactFormEmailTo: '',
  newsletterSmtp: { ...DEFAULT_NEWSLETTER_SMTP },
}

const pickGlobals = (data: Partial<ISiteSettings>) => {
  const globals: Partial<Record<GlobalKeys, unknown>> = {}
  const src = data as Record<string, unknown>
  for (const k of GLOBAL_KEYS) {
    if (src[k as string] !== undefined) {
      ;(globals as Record<string, unknown>)[k] = src[k as string]
    }
  }
  return globals
}

const omitGlobals = (data: Partial<ISiteSettings>) => {
  const copy: Record<string, unknown> = { ...(data as Record<string, unknown>) }
  for (const k of GLOBAL_KEYS) delete copy[k]
  delete copy.newsletterSmtpPassSet
  return copy as Partial<ISiteSettings>
}

function mergeGlobalsForResponse(g: Record<string, unknown>) {
  const rawNs = g.newsletterSmtp as Record<string, unknown> | undefined
  const passSet = !!(rawNs && typeof rawNs.pass === 'string' && rawNs.pass.length > 0)
  const newsletterSmtp = {
    enabled: !!(rawNs && rawNs.enabled),
    host: String(rawNs?.host || ''),
    port: typeof rawNs?.port === 'number' ? rawNs.port : 465,
    secure: rawNs?.secure !== false,
    user: String(rawNs?.user || ''),
    pass: '',
    from: String(rawNs?.from || ''),
  }
  return {
    multiDataModeEnabled: g.multiDataModeEnabled,
    enableChineseUI: g.enableChineseUI,
    dataLanguageScopes: g.dataLanguageScopes,
    cookieBannerEnabled: g.cookieBannerEnabled ?? DEFAULT_GLOBALS.cookieBannerEnabled,
    cookieConsentPromptVersion: g.cookieConsentPromptVersion ?? DEFAULT_GLOBALS.cookieConsentPromptVersion,
    legalPrivacyPath: g.legalPrivacyPath ?? DEFAULT_GLOBALS.legalPrivacyPath,
    legalTermsPath: g.legalTermsPath ?? DEFAULT_GLOBALS.legalTermsPath,
    legalDisclaimerPath: g.legalDisclaimerPath ?? DEFAULT_GLOBALS.legalDisclaimerPath,
    newsletterEnabled: g.newsletterEnabled ?? DEFAULT_GLOBALS.newsletterEnabled,
    contactFormEmailEnabled: g.contactFormEmailEnabled ?? DEFAULT_GLOBALS.contactFormEmailEnabled,
    contactFormEmailTo: String(g.contactFormEmailTo || ''),
    newsletterSmtp,
    newsletterSmtpPassSet: passSet,
  }
}

async function getOrCreateGlobalSettings(): Promise<any> {
  let globals = await GlobalSiteSettings.findOne()
  if (!globals) {
    globals = await GlobalSiteSettings.create(DEFAULT_GLOBALS)
  }
  return globals
}

/**
 * 获取网站设置（按语言）
 */
export const getSiteSettings = async (language: string = 'en'): Promise<ISiteSettings> => {
  try {
    let settings = await SiteSettings.findOne({ language })
    
    // 如果没有设置记录，创建默认设置
    if (!settings) {
      const defaultSettings = {
        language,
        siteName: 'AutomotiveHu',
        logoText: 'AutomotiveHu'
      }
      settings = new SiteSettings(defaultSettings)
      await settings.save()
    }

    const globals = await getOrCreateGlobalSettings()

    // 将全局字段覆盖到返回对象中，避免依赖语言记录同步
    const g = globals.toObject ? globals.toObject() : globals
    const grec = mergeGlobalsForResponse(g as Record<string, unknown>)
    const merged = Object.assign(settings.toObject(), grec)

    return merged as unknown as ISiteSettings
  } catch (error) {
    logger.error({ error }, '获取网站设置失败')
    throw error
  }
}

/**
 * 更新网站设置
 */
export const updateSiteSettings = async (language: string, settingsData: Partial<ISiteSettings>): Promise<ISiteSettings> => {
  try {
    const existingGlobals = await GlobalSiteSettings.findOne().lean() as {
      contactFormEmailEnabled?: boolean
      newsletterSmtp?: Record<string, unknown>
    } | null
    const globalPatch = pickGlobals(settingsData) as Partial<Record<GlobalKeys, unknown>>
    const localPatch = omitGlobals(settingsData)
    if (localPatch.socialLinks) {
      localPatch.socialLinks = normalizeSocialLinks(localPatch.socialLinks) as ISiteSettings['socialLinks']
    }

    if (globalPatch.newsletterSmtp && typeof globalPatch.newsletterSmtp === 'object') {
      const incoming = { ...(globalPatch.newsletterSmtp as Record<string, unknown>) }
      delete incoming.newsletterSmtpPassSet
      const prevPass = String(existingGlobals?.newsletterSmtp?.pass || '')
      const passIn = incoming.pass
      if (passIn === undefined || String(passIn).trim() === '') {
        incoming.pass = prevPass
      }
      globalPatch.newsletterSmtp = {
        enabled: !!incoming.enabled,
        host: String(incoming.host || '').trim().slice(0, 256),
        port: typeof incoming.port === 'number' && Number.isFinite(incoming.port) ? incoming.port : 465,
        secure: incoming.secure !== false,
        user: String(incoming.user || '').trim().slice(0, 256),
        pass: String(incoming.pass || '').slice(0, 512),
        from: String(incoming.from || '').trim().slice(0, 256),
      }
    }

    const nextContactFormEmailEnabled = globalPatch.contactFormEmailEnabled !== undefined
      ? globalPatch.contactFormEmailEnabled === true
      : existingGlobals?.contactFormEmailEnabled === true
    if (nextContactFormEmailEnabled && (globalPatch.contactFormEmailEnabled !== undefined || globalPatch.newsletterSmtp !== undefined)) {
      const smtp = (globalPatch.newsletterSmtp || existingGlobals?.newsletterSmtp) as Record<string, unknown> | undefined
      const smtpReady = !!smtp
        && smtp.enabled === true
        && String(smtp.host || '').trim() !== ''
        && String(smtp.user || '').trim() !== ''
        && String(smtp.pass || '').trim() !== ''
      if (!smtpReady) {
        throw new Error('contact_form_email_requires_smtp')
      }
    }

    // 更新全局设置（若存在）
    if (Object.keys(globalPatch).length > 0) {
      await GlobalSiteSettings.findOneAndUpdate({}, globalPatch, { upsert: true, new: true, runValidators: true })
    }

    let settings = await SiteSettings.findOne({ language })
    
    if (!settings) {
      // 如果没有设置记录，创建新的
      settings = new SiteSettings({ ...localPatch, language })
    } else {
      // 更新现有设置
      Object.assign(settings, localPatch)
      // Mongoose requires markModified for nested objects
      if (localPatch.externalLinks) {
        settings.markModified('externalLinks')
      }
      if (localPatch.socialLinks) {
        settings.markModified('socialLinks')
      }
    }
    
    await settings.save()

    const globals = await getOrCreateGlobalSettings()
    const g = globals.toObject ? globals.toObject() : globals
    const grec = mergeGlobalsForResponse(g as Record<string, unknown>)
    const merged = Object.assign(settings.toObject(), grec)

    return merged as unknown as ISiteSettings
  } catch (error) {
    logger.error({ error }, '更新网站设置失败')
    throw error
  }
}
