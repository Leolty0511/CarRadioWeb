import { describe, expect, it } from 'vitest'
import {
  ALL_CATEGORY_ID,
  buildCategoryChips,
  filterDocumentsByCategory
} from '@/utils/knowledgeCategoryChips'

describe('buildCategoryChips', () => {
  const categories = [
    { _id: 'cat-home', name: 'Homepage' },
    { _id: 'cat-settings', name: 'Settings' },
    { _id: 'cat-empty', name: 'Bluetooth' }
  ]

  it('keeps configured categories for unscoped knowledge sections', () => {
    const chips = buildCategoryChips(categories, [{ category: 'Homepage' }], 'All')
    expect(chips.map((chip) => chip.label)).toEqual(['All', 'Homepage', 'Settings', 'Bluetooth'])
  })

  it('only keeps categories that have documents when scoped to a head unit', () => {
    const chips = buildCategoryChips(
      categories,
      [{ category: 'Settings' }, { category: 'Settings' }, { category: '' }],
      'All',
      { scopedToExistingContent: true }
    )
    expect(chips).toEqual([
      { id: ALL_CATEGORY_ID, label: 'All' },
      { id: 'cat-settings', label: 'Settings' }
    ])
  })

  it('keeps unknown document categories in scoped mode', () => {
    const chips = buildCategoryChips(
      categories,
      [{ category: 'CarPlay' }],
      'All',
      { scopedToExistingContent: true }
    )
    expect(chips[1]).toEqual({ id: 'CarPlay', label: 'CarPlay' })
  })
})

describe('filterDocumentsByCategory', () => {
  const docs = [
    { id: '1', category: 'Homepage' },
    { id: '2', category: 'Settings' },
    { id: '3', category: '' }
  ]
  const chips = [
    { id: ALL_CATEGORY_ID, label: 'All' },
    { id: 'cat-home', label: 'Homepage' }
  ]

  it('returns every document for All', () => {
    expect(filterDocumentsByCategory(docs, ALL_CATEGORY_ID, chips)).toHaveLength(3)
  })

  it('filters by the selected chip label', () => {
    expect(filterDocumentsByCategory(docs, 'cat-home', chips).map((doc) => doc.id)).toEqual(['1'])
  })
})
