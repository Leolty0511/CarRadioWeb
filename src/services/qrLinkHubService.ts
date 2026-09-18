import { apiClient } from './apiClient'

export type QrLinkType = 'video' | 'pdf' | 'website' | 'page' | 'download' | 'other'

export interface QrLinkItem {
  _id?: string
  id?: string
  label: string
  description: string
  url: string
  type: QrLinkType
  enabled: boolean
  order: number
}

export interface QrLinkHub {
  _id: string
  token: string
  name: string
  title: string
  description: string
  enabled: boolean
  links: QrLinkItem[]
  createdAt: string
  updatedAt: string
}

export interface QrLinkHubInput {
  name: string
  title: string
  description: string
  enabled: boolean
  links: Array<Omit<QrLinkItem, '_id' | 'id'>>
}

export interface PublicQrLinkHub {
  token: string
  title: string
  description: string
  links: Array<Pick<QrLinkItem, 'id' | 'label' | 'description' | 'url' | 'type'>>
}

const BASE = '/qr-links'

export async function getQrLinkHubs(): Promise<QrLinkHub[]> {
  const result = await apiClient.get<QrLinkHub[]>(BASE)
  if (!result.success) {throw new Error(result.error || '二维码项目加载失败')}
  return result.data || []
}

export async function createQrLinkHub(input: QrLinkHubInput): Promise<QrLinkHub> {
  const result = await apiClient.post<QrLinkHub>(BASE, input)
  if (!result.success || !result.data) {throw new Error(result.error || '二维码项目创建失败')}
  return result.data
}

export async function updateQrLinkHub(id: string, input: QrLinkHubInput): Promise<QrLinkHub> {
  const result = await apiClient.put<QrLinkHub>(`${BASE}/${id}`, input)
  if (!result.success || !result.data) {throw new Error(result.error || '二维码项目更新失败')}
  return result.data
}

export async function deleteQrLinkHub(id: string): Promise<void> {
  const result = await apiClient.delete(`${BASE}/${id}`)
  if (!result.success) {throw new Error(result.error || '二维码项目删除失败')}
}

export async function getPublicQrLinkHub(token: string): Promise<{ data?: PublicQrLinkHub; error?: string }> {
  try {
    const response = await fetch(`/api/qr-links/public/${encodeURIComponent(token)}`, {
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(8000),
    })
    const result = await response.json() as { success: boolean; data?: PublicQrLinkHub; error?: string }
    return response.ok && result.success && result.data
      ? { data: result.data }
      : { error: result.error || 'qr_page_not_found' }
  } catch {
    return { error: 'qr_page_unavailable' }
  }
}
