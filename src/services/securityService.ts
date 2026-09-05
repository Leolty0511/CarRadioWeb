import apiClient from './apiClient'

export type SecurityStatus = 'normal' | 'suspicious' | 'blocked'
export interface SecurityIp { _id: string; ip: string; requestCount: number; firstSeenAt: string; lastSeenAt: string; lastUrl: string; lastMethod: string; lastStatusCode: number; lastUserAgent: string; lastReferer: string; requestsPerMinute: number; status: SecurityStatus; lastRule?: string }
export interface SecurityEvent { _id: string; ip: string; rule: string; severity: string; details: string; createdAt: string }
export interface DashboardData { blockedIps: number; suspiciousIps: number; attacksToday: number; activeIps: number; recentEvents: SecurityEvent[]; topRequestIps: SecurityIp[] }
export interface SecuritySettings { requestsPerMinute: number; hardLimit: number; apiRequestsPerMinute: number; loginFailures: number; notFoundThreshold: number; suspiciousThreshold: number; autoBan: boolean; defaultBanDurationHours: number; autoUnban: boolean; crowdsecEnabled: boolean }
export const securityApi = {
  dashboard: () => apiClient.get<DashboardData>('/security/dashboard'),
  ips: (params: Record<string, string | number>) => apiClient.get<{ items: SecurityIp[]; pagination: { page: number; total: number; totalPages: number } }>('/security/ips', params),
  detail: (ip: string) => apiClient.get<{ summary: SecurityIp; requests: Array<{ time: string; method: string; url: string; statusCode: number; userAgent: string; responseTimeMs: number }>; events: SecurityEvent[]; ban?: { reason: string; expiresAt?: string } }>('/security/ips/' + encodeURIComponent(ip)),
  ban: (ip: string, reason: string, durationHours?: number) => apiClient.post('/security/ban', { ip, reason, durationHours }),
  unban: (ip: string) => apiClient.post('/security/unban', { ip }),
  settings: () => apiClient.get<SecuritySettings>('/security/settings'),
  updateSettings: (data: SecuritySettings) => apiClient.put<SecuritySettings>('/security/settings', data),
  whitelist: () => apiClient.get<Array<{ _id: string; ip: string; note?: string; createdAt: string }>>('/security/whitelist'),
  addWhitelist: (ip: string, note: string) => apiClient.post('/security/whitelist', { ip, note }),
  removeWhitelist: (ip: string) => apiClient.delete('/security/whitelist/' + encodeURIComponent(ip)),
}
