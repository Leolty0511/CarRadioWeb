import { apiClient } from './apiClient'

export interface MemberRecord {
  _id: string
  email: string
  nickname: string
  status: 'pending' | 'active' | 'rejected' | 'suspended'
  reviewNote: string
  registrationIp: string
  registrationCountry: string
  registrationRegion: string
  registrationCity: string
  lastLoginAt: string | null
  lastLoginIp: string
  loginHistory: { ip: string; country: string; region: string; city: string; userAgent: string; createdAt: string }[]
  createdAt: string
}

export const getMemberAdminSettings = () => apiClient.get('/members/settings/current')
export const saveMemberAdminSettings = (data: { registrationEnabled: boolean; approvalRequired: boolean; invitationRequired: boolean }) => apiClient.put('/members/settings/current', data)
export const getMembers = (params?: Record<string, unknown>) => apiClient.get<{ items: MemberRecord[]; total: number }>('/members', params)
export const setMemberStatus = (id: string, status: string, reviewNote = '') => apiClient.put(`/members/${id}/status`, { status, reviewNote })
export const getMemberInvitations = () => apiClient.get('/members/invitations/list')
export const createMemberInvitation = (data: { maxUses: number; expiresAt?: string; note?: string }) => apiClient.post('/members/invitations', data)
export const toggleMemberInvitation = (id: string, enabled: boolean) => apiClient.put(`/members/invitations/${id}`, { enabled })
