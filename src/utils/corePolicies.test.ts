import { describe, expect, it } from 'vitest'
import { classifyTransferState } from '../../backend/src/services/superAdminTransferState'
import {
  documentKnowledgeSection,
  isPublishedDocument,
  videoKnowledgeSection,
} from '../../backend/src/services/publicDocumentPolicy'

describe('public document policy', () => {
  it('only exposes published documents', () => {
    expect(isPublishedDocument({ status: 'published' })).toBe(true)
    expect(isPublishedDocument({ status: 'draft' })).toBe(false)
    expect(isPublishedDocument({ status: 'archived' })).toBe(false)
    expect(isPublishedDocument(null)).toBe(false)
  })

  it('maps legacy videos to installation and device videos separately', () => {
    expect(videoKnowledgeSection(undefined)).toBe('videoTutorialsEnabled')
    expect(videoKnowledgeSection('installation')).toBe('videoTutorialsEnabled')
    expect(videoKnowledgeSection('device-operation')).toBe('deviceOperationVideosEnabled')
    expect(documentKnowledgeSection('general')).toBe('tutorialsEnabled')
    expect(documentKnowledgeSection('structured')).toBe('vehicleDataEnabled')
  })
})

describe('super admin transfer state', () => {
  it('recognizes a committed transfer after an uncertain database response', () => {
    expect(classifyTransferState('admin', 'super_admin')).toBe('transferred')
  })

  it('distinguishes the original and ownerless states', () => {
    expect(classifyTransferState('super_admin', 'admin')).toBe('original')
    expect(classifyTransferState('admin', 'admin')).toBe('no_owner')
    expect(classifyTransferState('super_admin', 'super_admin')).toBe('invalid')
  })
})
