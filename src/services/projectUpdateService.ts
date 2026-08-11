import { apiClient } from '@/services/apiClient'

export type UpdateJobState = 'idle' | 'running' | 'restarting' | 'completed' | 'failed'

export interface ProjectUpdateLogEntry {
  commit: string
  shortCommit: string
  message: string
  author: string
  committedAt: string
}

export interface ProjectUpdateInfo {
  repository: string
  repositoryUrl: string
  currentVersion: string
  currentCommit: string | null
  currentCommitShort: string | null
  currentCommitMessage: string | null
  branch: string
  remoteVersion: string | null
  remoteCommit: string | null
  remoteCommitShort: string | null
  remoteCommitMessage: string | null
  commitsAhead: number
  commitsBehind: number
  updateLog: ProjectUpdateLogEntry[]
  releaseNotes: string | null
  updateAvailable: boolean
  checkedAt: string | null
  gitRepository: boolean
  repositoryValid: boolean
  workingTreeClean: boolean
  selfUpdateEnabled: boolean
  restartMode: 'pm2' | 'unavailable'
  canUpdate: boolean
  blocker: string | null
}

export interface UpdateJobStatus {
  jobId: string | null
  state: UpdateJobState
  stage: string
  message: string
  startedAt: string | null
  updatedAt: string | null
  completedAt: string | null
  fromCommit?: string
  toCommit?: string
  logs: string[]
}

function requireData<T>(response: { success: boolean; data?: T; error?: string }): T {
  if (!response.success || !response.data) {throw new Error(response.error || 'request_failed')}
  return response.data
}

export async function getProjectUpdateInfo(): Promise<ProjectUpdateInfo> {
  return requireData(await apiClient.get<ProjectUpdateInfo>('/system/update/info', undefined, { retries: 0 }))
}

export async function checkProjectUpdate(): Promise<ProjectUpdateInfo> {
  return requireData(await apiClient.post<ProjectUpdateInfo>('/system/update/check', {}, {
    timeout: 60_000,
    retries: 0,
  }))
}

export async function getProjectUpdateStatus(): Promise<UpdateJobStatus> {
  return requireData(await apiClient.get<UpdateJobStatus>('/system/update/status', undefined, { retries: 0 }))
}

export async function applyProjectUpdate(): Promise<UpdateJobStatus> {
  return requireData(await apiClient.post<UpdateJobStatus>('/system/update/apply', {
    repository: 'Leolty0511/CarRadioWeb',
  }, {
    timeout: 60_000,
    retries: 0,
  }))
}
