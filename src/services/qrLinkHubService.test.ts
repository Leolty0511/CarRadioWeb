import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPublicQrLinkHub } from './qrLinkHubService'

afterEach(() => vi.restoreAllMocks())

describe('public QR page requests', () => {
  it('loads anonymously without caching or requesting a CSRF cookie', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { token: 'DemoToken1234', title: 'Resources', description: '', links: [] } }),
    } as Response)

    const result = await getPublicQrLinkHub('DemoToken1234')
    expect(result.data?.title).toBe('Resources')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/qr-links/public/DemoToken1234', expect.objectContaining({
      cache: 'no-store',
      credentials: 'omit',
    }))
  })

  it('preserves disabled and deleted states', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: false, json: async () => ({ success: false, error: 'qr_page_disabled' }) } as Response)
      .mockResolvedValueOnce({ ok: false, json: async () => ({ success: false, error: 'qr_page_not_found' }) } as Response)

    expect(await getPublicQrLinkHub('DemoToken1234')).toEqual({ error: 'qr_page_disabled' })
    expect(await getPublicQrLinkHub('DemoToken1234')).toEqual({ error: 'qr_page_not_found' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
