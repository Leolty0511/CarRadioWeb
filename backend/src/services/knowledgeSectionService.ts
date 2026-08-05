import { ModuleSettings } from '../models/ModuleSettings'

export type KnowledgeSectionKey =
  | 'vehicleDataEnabled'
  | 'videoTutorialsEnabled'
  | 'deviceOperationVideosEnabled'
  | 'tutorialsEnabled'
  | 'canbusSettingsEnabled'

export const DEFAULT_KNOWLEDGE_SECTIONS: Record<KnowledgeSectionKey, boolean> = {
  vehicleDataEnabled: true,
  videoTutorialsEnabled: true,
  deviceOperationVideosEnabled: true,
  tutorialsEnabled: true,
  canbusSettingsEnabled: true,
}

export async function getPublicKnowledgeSettings(): Promise<Record<KnowledgeSectionKey, boolean>> {
  const moduleSettings = await ModuleSettings.findOne().lean()
  const knowledgeBase = moduleSettings?.knowledgeBase as
    | { enabled?: boolean; settings?: Partial<Record<KnowledgeSectionKey, boolean>> }
    | undefined

  if (knowledgeBase?.enabled === false) {
    return Object.fromEntries(
      Object.keys(DEFAULT_KNOWLEDGE_SECTIONS).map(key => [key, false])
    ) as Record<KnowledgeSectionKey, boolean>
  }

  return Object.fromEntries(
    Object.entries(DEFAULT_KNOWLEDGE_SECTIONS).map(([key, fallback]) => [
      key,
      knowledgeBase?.settings?.[key as KnowledgeSectionKey] ?? fallback,
    ])
  ) as Record<KnowledgeSectionKey, boolean>
}

export async function isKnowledgeSectionEnabled(section: KnowledgeSectionKey): Promise<boolean> {
  const settings = await getPublicKnowledgeSettings()
  return settings[section]
}
