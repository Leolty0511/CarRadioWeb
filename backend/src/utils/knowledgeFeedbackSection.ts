export const CANBUS_FEEDBACK_DOCUMENT_ID = 'canbus-settings'

export const KNOWLEDGE_FEEDBACK_SECTIONS = [
  'wiring',
  'installation-video',
  'device-operation',
  'image-text',
  'canbus'
] as const

export type KnowledgeFeedbackSection = typeof KNOWLEDGE_FEEDBACK_SECTIONS[number]

export function isKnowledgeFeedbackSection(value: unknown): value is KnowledgeFeedbackSection {
  return typeof value === 'string' && (KNOWLEDGE_FEEDBACK_SECTIONS as readonly string[]).includes(value)
}

export function sectionFromVideoTutorialType(
  tutorialType?: 'installation' | 'device-operation' | string
): KnowledgeFeedbackSection {
  return tutorialType === 'device-operation' ? 'device-operation' : 'installation-video'
}
