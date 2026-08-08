import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './apiClient'
import { updateDocument } from './documentApi'

describe('document API routes', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the typed general-document endpoint when updating', async () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({
      success: true,
      data: { _id: 'doc-1' },
    })

    await updateDocument('doc-1', { documentType: 'general', title: 'Updated' })

    expect(put).toHaveBeenCalledWith('/documents/general/doc-1', {
      documentType: 'general',
      title: 'Updated',
    })
  })

  it('uses the typed structured-document endpoint when updating', async () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({
      success: true,
      data: { _id: 'doc-2' },
    })

    await updateDocument('doc-2', { documentType: 'structured', title: 'Updated' })

    expect(put).toHaveBeenCalledWith('/documents/structured/doc-2', {
      documentType: 'structured',
      title: 'Updated',
    })
  })
})
