import { describe, expect, it } from 'vitest'
import {
  CANBUS_FEEDBACK_DOCUMENT_ID,
  isKnowledgeFeedbackSection,
  sectionFromVideoTutorialType
} from '@/utils/knowledgeFeedbackSection'

describe('knowledgeFeedbackSection', () => {
  it('maps video tutorial types to knowledge sections', () => {
    expect(sectionFromVideoTutorialType('device-operation')).toBe('device-operation')
    expect(sectionFromVideoTutorialType('installation')).toBe('installation-video')
    expect(sectionFromVideoTutorialType()).toBe('installation-video')
  })

  it('accepts the five knowledge sections and the CANBus document id', () => {
    expect(isKnowledgeFeedbackSection('wiring')).toBe(true)
    expect(isKnowledgeFeedbackSection('canbus')).toBe(true)
    expect(isKnowledgeFeedbackSection('video')).toBe(false)
    expect(CANBUS_FEEDBACK_DOCUMENT_ID).toBe('canbus-settings')
  })
})
