export const ALL_CATEGORY_ID = '__all__'

export interface CategoryChipSource {
  _id: string
  name: string
}

export interface DocumentCategorySource {
  category?: string
}

export interface FilterChipItem {
  id: string
  label: string
}

/**
 * Build the public category chip row.
 * Head-unit scoped views only surface categories that actually have documents.
 * Other knowledge sections keep configured categories so navigation exists before content.
 */
export function buildCategoryChips(
  categories: CategoryChipSource[],
  documents: DocumentCategorySource[],
  allLabel: string,
  options?: { scopedToExistingContent?: boolean }
): FilterChipItem[] {
  const chips: FilterChipItem[] = [{ id: ALL_CATEGORY_ID, label: allLabel }]
  const scoped = Boolean(options?.scopedToExistingContent)

  if (scoped) {
    const seen = new Set<string>()
    for (const doc of documents) {
      const name = doc.category?.trim()
      if (!name || seen.has(name)) {
        continue
      }
      seen.add(name)
      const matched = categories.find((category) => category.name === name)
      chips.push({
        id: matched?._id || name,
        label: name
      })
    }
    return chips
  }

  for (const category of categories) {
    chips.push({
      id: category._id,
      label: category.name
    })
  }
  return chips
}

export function filterDocumentsByCategory<T extends DocumentCategorySource>(
  documents: T[],
  selectedId: string,
  chips: FilterChipItem[]
): T[] {
  if (selectedId === ALL_CATEGORY_ID) {
    return documents
  }
  const selected = chips.find((chip) => chip.id === selectedId)
  if (!selected) {
    return documents
  }
  return documents.filter((doc) => (doc.category || '') === selected.label)
}
