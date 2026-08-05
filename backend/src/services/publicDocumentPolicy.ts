import type { KnowledgeSectionKey } from './knowledgeSectionService'

export type PublicDocumentType = 'general' | 'video' | 'structured'

export function isPublishedDocument(document: unknown): boolean {
  return Boolean(
    document &&
    typeof document === 'object' &&
    (document as { status?: string }).status === 'published'
  )
}

export function videoKnowledgeSection(tutorialType: unknown): KnowledgeSectionKey {
  return tutorialType === 'device-operation'
    ? 'deviceOperationVideosEnabled'
    : 'videoTutorialsEnabled'
}

export function documentKnowledgeSection(
  type: PublicDocumentType,
  document?: unknown
): KnowledgeSectionKey {
  if (type === 'structured') {return 'vehicleDataEnabled'}
  if (type === 'general') {return 'tutorialsEnabled'}
  return videoKnowledgeSection((document as { tutorialType?: string } | undefined)?.tutorialType)
}
