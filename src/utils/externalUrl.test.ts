import { describe, expect, it } from 'vitest'
import { toExternalHref } from '@/utils/externalUrl'

describe('toExternalHref', () => {
  it('prefixes https for host-only social links', () => {
    expect(toExternalHref('www.youtube.com/@Fortdows')).toBe('https://www.youtube.com/@Fortdows')
  })

  it('keeps existing http(s) URLs', () => {
    expect(toExternalHref('https://t.me/channel')).toBe('https://t.me/channel')
    expect(toExternalHref('http://example.com')).toBe('http://example.com')
  })

  it('rejects javascript URLs and empty values', () => {
    expect(toExternalHref('javascript:alert(1)')).toBe('')
    expect(toExternalHref('  ')).toBe('')
  })
})
