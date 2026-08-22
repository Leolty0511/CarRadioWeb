import { describe, expect, it } from 'vitest'
import { getKnowledgeImageThumbnailUrl } from './knowledgeImage'

describe('getKnowledgeImageThumbnailUrl', () => {
  it('maps knowledge WebP URLs to their thumbnail URL', () => {
    expect(getKnowledgeImageThumbnailUrl('https://cdn.example.com/images/knowledge/setting.webp'))
      .toBe('https://cdn.example.com/images/knowledge/setting-thumb.webp')
  })

  it('preserves query strings and hashes', () => {
    expect(getKnowledgeImageThumbnailUrl('/uploads/images/knowledge/setting.webp?v=1#preview'))
      .toBe('/uploads/images/knowledge/setting-thumb.webp?v=1#preview')
  })

  it('does not alter legacy or non-knowledge URLs', () => {
    expect(getKnowledgeImageThumbnailUrl('/images/uploads/setting.webp')).toBe('/images/uploads/setting.webp')
    expect(getKnowledgeImageThumbnailUrl('/images/knowledge/setting.jpg')).toBe('/images/knowledge/setting.jpg')
  })
})
