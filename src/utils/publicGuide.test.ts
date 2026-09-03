import { describe, expect, it } from 'vitest'
import { isPublicGuidePath, toPublicGuideHref } from './publicGuide'

describe('publicGuide', () => {
  it('detects /guide and nested paths without matching similar prefixes', () => {
    expect(isPublicGuidePath('/guide')).toBe(true)
    expect(isPublicGuidePath('/guide/vehicle-data')).toBe(true)
    expect(isPublicGuidePath('/zh/guide/user-manual')).toBe(true)
    expect(isPublicGuidePath('/knowledge')).toBe(false)
    expect(isPublicGuidePath('/guidelines')).toBe(false)
  })

  it('rewrites knowledge and user-manual hrefs only on the public guide', () => {
    expect(toPublicGuideHref('/guide', '/knowledge')).toBe('/guide')
    expect(toPublicGuideHref('/guide', '/knowledge/vehicle-data')).toBe('/guide/vehicle-data')
    expect(toPublicGuideHref('/guide', '/knowledge/vehicle/abc')).toBe('/guide/vehicle/abc')
    expect(toPublicGuideHref('/guide', '/user-manual/foo')).toBe('/guide/user-manual/foo')
    expect(toPublicGuideHref('/knowledge', '/knowledge/vehicle-data')).toBe('/knowledge/vehicle-data')
  })
})
