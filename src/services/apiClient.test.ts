import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './apiClient'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('ApiClient multipart uploads', () => {
  beforeEach(() => {
    document.cookie = 'csrf_token=test-token; Path=/'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.cookie = 'csrf_token=; Max-Age=0; Path=/'
  })

  it('keeps the CSRF header when uploading FormData', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ success: true, url: '/uploads/documents/test.jpg' })
    )

    const formData = new FormData()
    formData.append('image', new Blob(['image']), 'test.jpg')
    const result = await apiClient.upload('/upload/image', formData, { retries: 0 })

    expect(result.success).toBe(true)
    const request = fetchMock.mock.calls[0][1]
    const headers = new Headers(request?.headers)
    expect(headers.get('X-CSRF-Token')).toBe('test-token')
    expect(headers.has('Content-Type')).toBe(false)
    expect(request?.credentials).toBe('include')
  })

  it('refreshes an invalid CSRF token and replays an upload even with retries disabled', async () => {
    let uploadAttempts = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if ((init?.method || 'GET') === 'GET') {
        document.cookie = 'csrf_token=fresh-token; Path=/'
        return jsonResponse({ success: true })
      }

      uploadAttempts += 1
      if (uploadAttempts === 1) {
        return jsonResponse({ success: false, error: 'csrf_token_invalid' }, 403)
      }
      return jsonResponse({ success: true, url: '/uploads/documents/test.jpg' })
    })

    const result = await apiClient.upload('/upload/image', new FormData(), { retries: 0 })

    expect(result.success).toBe(true)
    expect(uploadAttempts).toBe(2)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const replayRequest = fetchMock.mock.calls[2][1]
    expect(new Headers(replayRequest?.headers).get('X-CSRF-Token')).toBe('fresh-token')
  })
})
