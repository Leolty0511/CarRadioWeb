/**
 * Admin user management service
 * API client for /api/users endpoints (super_admin only)
 */

import { apiClient } from './apiClient'
import type { MemberFavorite } from './memberAuthService'

export interface AdminUserRecord {
  _id: string
  email?: string | null
  loginUsername?: string | null
  nickname: string
  avatar: string
  role: 'super_admin' | 'admin'
  provider: 'google' | 'github' | 'email'
  permissions: string[]
  isActive: boolean
  mustChangeCredentials: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateUserPayload {
  nickname: string
  permissions: string[]
  email?: string
}

export interface AdminInvitationRecord {
  _id: string
  email: string
  nickname: string
  permissions: string[]
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
  createdAt: string
  updatedAt: string
  deliveryStatus?: 'pending' | 'sent' | 'failed'
  sendError?: string | null
  invitedBy?: { nickname?: string; email?: string | null; loginUsername?: string | null } | string
}

interface UpdateUserPayload {
  nickname?: string
  permissions?: string[]
  isActive?: boolean
}

export interface UpdateOwnAccountPayload {
  email: string
  nickname: string
  currentPassword?: string
  newPassword?: string
}

export interface AdminProfile {
  id: string
  email: string
  nickname: string
  avatar: string
  createdAt?: string
  provider: 'google' | 'github' | 'email'
}

/** Fetch all admin users */
export async function getUsers(): Promise<AdminUserRecord[]> {
  const res = await apiClient.get<AdminUserRecord[]>('/users')
  return res.success && res.data ? res.data : []
}

/** Fetch all available permissions */
export async function getPermissions(): Promise<string[]> {
  const res = await apiClient.get<string[]>('/users/permissions')
  return res.success && res.data ? res.data : []
}

/** Create a new admin invitation */
export async function createUser(data: CreateUserPayload) {
  return apiClient.post<AdminInvitationRecord>('/users', data)
}

/** Fetch recent administrator invitations, including delivery and acceptance state. */
export async function getAdminInvitations(): Promise<AdminInvitationRecord[]> {
  const res = await apiClient.get<AdminInvitationRecord[]>('/users/invitations')
  return res.success && res.data ? res.data : []
}

/** Resend an invitation with a fresh 48-hour token. */
export async function resendAdminInvitation(id: string) {
  return apiClient.post<AdminInvitationRecord>(`/users/invitations/${id}/resend`, {})
}

/** Update admin user */
export async function updateUser(id: string, data: UpdateUserPayload) {
  return apiClient.put<AdminUserRecord>(`/users/${id}`, data)
}

/** Reset an ordinary administrator's password (super_admin only). */
export async function resetAdminPassword(id: string, newPassword: string) {
  return apiClient.put<AdminUserRecord>(`/users/${id}/password`, { newPassword })
}

/** Delete admin user */
export async function deleteUser(id: string) {
  return apiClient.delete(`/users/${id}`)
}

/** Update own nickname (any authenticated user) */
export async function updateOwnNickname(nickname: string) {
  return apiClient.put<AdminUserRecord>('/users/me/nickname', { nickname })
}

/** Update the signed-in administrator's email and optional password. */
export async function updateOwnAccount(data: UpdateOwnAccountPayload) {
  return apiClient.put<AdminUserRecord>('/users/me/account', data)
}

export async function getAdminProfile() {
  return apiClient.get<AdminProfile>('/users/me/profile')
}

export async function uploadAdminAvatar(file: File) {
  const form = new FormData()
  form.append('avatar', file)
  return apiClient.upload<{ avatar: string }>('/users/me/profile/avatar', form, { retries: 0 })
}

export async function updateAdminPassword(currentPassword: string, newPassword: string) {
  return apiClient.put('/users/me/profile/password', { currentPassword, newPassword })
}

export async function getAdminFavorites() {
  return apiClient.get<MemberFavorite[]>('/users/me/favorites')
}

export async function getAdminFavoriteStatus(documentId: string) {
  return apiClient.get<{ favorited: boolean }>(`/users/me/favorites/status/${encodeURIComponent(documentId)}`)
}

export async function addAdminFavorite(documentId: string) {
  return apiClient.post(`/users/me/favorites/${encodeURIComponent(documentId)}`, {})
}

export async function removeAdminFavorite(documentId: string) {
  return apiClient.delete(`/users/me/favorites/${encodeURIComponent(documentId)}`)
}

/** Transfer the single super-admin role to another active administrator. */
export async function transferSuperAdmin(targetUserId: string, currentPassword: string) {
  return apiClient.post('/users/transfer-super-admin', { targetUserId, currentPassword })
}
