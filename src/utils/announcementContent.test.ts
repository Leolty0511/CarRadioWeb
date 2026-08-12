import { describe, expect, it } from 'vitest'
import {
  announcementHtmlToPlainText,
  getAnnouncementDisplayTitle,
  getAnnouncementHtml,
  normalizeAnnouncementText,
  plainTextToAnnouncementHtml
} from './announcementContent'

describe('announcement content formatting', () => {
  it('keeps pasted and escaped line breaks', () => {
    expect(normalizeAnnouncementText('first\\nsecond\r\nthird')).toBe('first\nsecond\nthird')
  })

  it('converts legacy text into paragraphs without treating it as HTML', () => {
    expect(plainTextToAnnouncementHtml('Hello\n\n<b>World</b>')).toBe(
      '<p>Hello</p><p><br /></p><p>&lt;b&gt;World&lt;/b&gt;</p>'
    )
  })

  it('uses rich content when available and extracts its banner text', () => {
    const html = '<h2>Update</h2><p>First line</p><ul><li>Second line</li></ul>'
    expect(getAnnouncementHtml('fallback', html)).toBe(html)
    expect(announcementHtmlToPlainText(html)).toContain('Update')
    expect(announcementHtmlToPlainText(html)).toContain('Second line')
  })

  it('does not display legacy body excerpts as announcement titles', () => {
    const content = 'Dear Users, Thank you for your continued support and trust! More announcement content follows.'
    expect(getAnnouncementDisplayTitle(content.slice(0, 60), content, 'Announcement')).toBe('Announcement')
    expect(getAnnouncementDisplayTitle('Service update', content, 'Announcement')).toBe('Service update')
    expect(getAnnouncementDisplayTitle('', content, 'Announcement')).toBe('Announcement')
  })
})
