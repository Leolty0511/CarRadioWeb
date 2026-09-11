import { apiClient } from './apiClient'
import type { MemberVehicleFilterOption } from '@/components/admin/MemberVehicleFilter'

export interface MemberRecord {
  _id: string
  email: string
  nickname: string
  avatar: string
  status: 'pending' | 'active' | 'rejected' | 'suspended'
  reviewNote: string
  registrationIp: string
  registrationCountry: string
  registrationRegion: string
  registrationCity: string
  lastLoginAt: string | null
  lastLoginIp: string
  lastSeenAt: string | null
  lastActivityAt: string | null
  lastSeenIp: string
  lastSeenUserAgent: string
  lastSeenDeviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown'
  lastSeenOs: string
  lastSeenBrowser: string
  lastSeenBrowserVersion: string
  isOnline: boolean
  loginHistory: { ip: string; country: string; region: string; city: string; userAgent: string; createdAt: string }[]
  vehicles: AdminMemberVehicle[]
  vehicleCount: number
  createdAt: string
}

export interface AdminMemberVehicle {
  _id: string
  vehicleId: string
  brand: string
  modelName: string
  yearRange: string
  generation: string
  nickname: string
  isDefault: boolean
  forumVisibility: 'visible' | 'hidden'
  createdAt: string
}

export const getMembers = (params?: Record<string, unknown>) => apiClient.get<{
  items: MemberRecord[]
  page: number
  limit: number
  total: number
  totalPages: number
  stats?: { total: number; active: number; online: number }
}>('/members', params)
export const getOnlineMembers = () => apiClient.get<{
  count: number
  since: string
  items: Pick<MemberRecord, 'nickname' | 'email' | 'avatar' | 'lastSeenAt' | 'lastSeenIp' | 'lastSeenDeviceType' | 'lastSeenOs' | 'lastSeenBrowser' | 'lastSeenBrowserVersion' | 'registrationCountry' | 'registrationRegion' | 'registrationCity'>[]
}>('/members/online')
export const getMemberVehicleFilterOptions = () => apiClient.get<MemberVehicleFilterOption[]>('/members/vehicle-filter-options')
export const setMemberStatus = (id: string, status: string, reviewNote = '') => apiClient.put(`/members/${id}/status`, { status, reviewNote })
