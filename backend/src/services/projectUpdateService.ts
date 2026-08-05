import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import fs from 'fs'
import { promises as fsPromises } from 'fs'
import os from 'os'
import path from 'path'
import { createLogger } from '../utils/logger'

const REPOSITORY = 'Leolty0511/CarRadioWeb'
const REPOSITORY_URL = `https://github.com/${REPOSITORY}`
const DEFAULT_BRANCH = 'main'
const COMMAND_TIMEOUT_MS = 60_000
const AUTO_CHECK_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000
const AUTO_CHECK_START_DELAY_MS = 10_000
const REPO_ROOT = path.resolve(__dirname, '../../..')
const STATUS_FILE = process.env.UPDATE_STATUS_FILE || path.join(os.tmpdir(), 'carradioweb-update-status.json')
const logger = createLogger('project-update-service')

let lastRemoteCheckedAt: string | null = null
let remoteFetchPromise: Promise<void> | null = null
let autoCheckSchedulerStarted = false

export type UpdateJobState = 'idle' | 'running' | 'restarting' | 'completed' | 'failed'

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

interface CommandResult {
  stdout: string
  stderr: string
}

function runCommand(command: string, args: string[], cwd = REPO_ROOT, timeout = COMMAND_TIMEOUT_MS): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { cwd, timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error) {
          const detail = String(stderr || stdout || error.message).trim()
          reject(new Error(detail || error.message))
          return
        }
        resolve({ stdout: String(stdout).trim(), stderr: String(stderr).trim() })
      }
    )
  })
}

function runGit(args: string[], timeout?: number): Promise<CommandResult> {
  return runCommand('git', args, REPO_ROOT, timeout)
}

async function refreshRemoteBranch(branch: string): Promise<void> {
  if (!remoteFetchPromise) {
    remoteFetchPromise = runGit(['fetch', '--quiet', 'origin', branch], 120_000)
      .then(() => {
        lastRemoteCheckedAt = new Date().toISOString()
      })
      .finally(() => {
        remoteFetchPromise = null
      })
  }
  await remoteFetchPromise
}

async function readPackageVersion(): Promise<string> {
  try {
    const raw = await fsPromises.readFile(path.join(REPO_ROOT, 'package.json'), 'utf8')
    const pkg = JSON.parse(raw) as { version?: string }
    return pkg.version || 'unknown'
  } catch {
    return 'unknown'
  }
}

function parsePackageVersion(raw: string): string | null {
  try {
    return (JSON.parse(raw) as { version?: string }).version || null
  } catch {
    return null
  }
}

function isExpectedRemote(remoteUrl: string): boolean {
  const normalized = remoteUrl.trim().replace(/\/+$/, '').replace(/\.git$/i, '').toLowerCase()
  return normalized === 'https://github.com/leolty0511/carradioweb' ||
    normalized === 'git@github.com:leolty0511/carradioweb' ||
    normalized === 'ssh://git@github.com/leolty0511/carradioweb'
}

function parseAheadBehind(raw: string): { ahead: number; behind: number } {
  const [aheadRaw, behindRaw] = raw.trim().split(/\s+/)
  return {
    ahead: Number.parseInt(aheadRaw || '0', 10) || 0,
    behind: Number.parseInt(behindRaw || '0', 10) || 0,
  }
}

function parseUpdateLog(raw: string): ProjectUpdateLogEntry[] {
  return raw
    .split('\x1e')
    .map(record => record.trim())
    .filter(Boolean)
    .map(record => {
      const [commit, shortCommit, message, author, committedAt] = record.split('\x00')
      return { commit, shortCommit, message, author, committedAt }
    })
    .filter(entry => Boolean(entry.commit && entry.shortCommit && entry.message))
}

function getRestartMode(): 'pm2' | 'unavailable' {
  return process.env.pm_id != null || Boolean(process.env.PM2_PROCESS_NAME) ? 'pm2' : 'unavailable'
}

function getSelfUpdateEnabled(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.SELF_UPDATE_ENABLED !== 'false'
}

function getBlocker(info: Omit<ProjectUpdateInfo, 'canUpdate' | 'blocker'>): string | null {
  if (!info.gitRepository) return 'not_git_repository'
  if (!info.repositoryValid) return 'unexpected_git_remote'
  if (!info.workingTreeClean) return 'working_tree_dirty'
  if (!info.selfUpdateEnabled) return 'self_update_disabled'
  if (info.restartMode !== 'pm2') return 'pm2_required'
  if (info.commitsAhead > 0) return 'local_branch_diverged'
  if (!info.updateAvailable) return 'already_up_to_date'
  return null
}

export async function getProjectUpdateInfo(refreshRemote = false): Promise<ProjectUpdateInfo> {
  const currentVersion = await readPackageVersion()
  const configuredBranch = process.env.UPDATE_BRANCH?.trim() || DEFAULT_BRANCH
  const restartMode = getRestartMode()
  const selfUpdateEnabled = getSelfUpdateEnabled()

  let currentCommit: string | null = null
  let currentCommitMessage: string | null = null
  let remoteCommit: string | null = null
  let remoteCommitMessage: string | null = null
  let remoteVersion: string | null = null
  let commitsAhead = 0
  let commitsBehind = 0
  let updateLog: ProjectUpdateLogEntry[] = []
  let gitRepository = false
  let repositoryValid = false
  let workingTreeClean = false
  let checkedAt: string | null = lastRemoteCheckedAt
  let branch = configuredBranch

  try {
    gitRepository = (await runGit(['rev-parse', '--is-inside-work-tree'])).stdout === 'true'
    if (gitRepository) {
      currentCommit = (await runGit(['rev-parse', 'HEAD'])).stdout
      currentCommitMessage = (await runGit(['log', '-1', '--format=%s', 'HEAD'])).stdout || null
      const detectedBranch = (await runGit(['rev-parse', '--abbrev-ref', 'HEAD'])).stdout
      if (!process.env.UPDATE_BRANCH && detectedBranch && detectedBranch !== 'HEAD') branch = detectedBranch

      const remoteUrl = (await runGit(['remote', 'get-url', 'origin'])).stdout
      repositoryValid = isExpectedRemote(remoteUrl)
      workingTreeClean = (await runGit(['status', '--porcelain'])).stdout.length === 0

      if (repositoryValid) {
        if (refreshRemote) {
          await refreshRemoteBranch(branch)
          checkedAt = lastRemoteCheckedAt
        }

        try {
          remoteCommit = (await runGit(['rev-parse', `origin/${branch}`])).stdout
          remoteCommitMessage = (await runGit(['log', '-1', '--format=%s', `origin/${branch}`])).stdout || null
          const packageRaw = (await runGit(['show', `origin/${branch}:package.json`])).stdout
          remoteVersion = parsePackageVersion(packageRaw)
          const distance = parseAheadBehind((await runGit(['rev-list', '--left-right', '--count', `HEAD...origin/${branch}`])).stdout)
          commitsAhead = distance.ahead
          commitsBehind = distance.behind
          if (commitsBehind > 0 && commitsAhead === 0) {
            const log = await runGit([
              'log',
              '--max-count=30',
              '--format=%H%x00%h%x00%s%x00%an%x00%aI%x1e',
              `HEAD..origin/${branch}`,
            ])
            updateLog = parseUpdateLog(log.stdout)
          }
        } catch {
          // A remote ref may not exist until the first explicit check.
        }
      }
    }
  } catch {
    gitRepository = false
  }

  const baseInfo: Omit<ProjectUpdateInfo, 'canUpdate' | 'blocker'> = {
    repository: REPOSITORY,
    repositoryUrl: REPOSITORY_URL,
    currentVersion,
    currentCommit,
    currentCommitShort: currentCommit?.slice(0, 7) || null,
    currentCommitMessage,
    branch,
    remoteVersion,
    remoteCommit,
    remoteCommitShort: remoteCommit?.slice(0, 7) || null,
    remoteCommitMessage,
    commitsAhead,
    commitsBehind,
    updateLog,
    updateAvailable: commitsBehind > 0 && commitsAhead === 0,
    checkedAt,
    gitRepository,
    repositoryValid,
    workingTreeClean,
    selfUpdateEnabled,
    restartMode,
  }
  const blocker = getBlocker(baseInfo)
  return { ...baseInfo, canUpdate: blocker === null, blocker }
}

/** Check the configured remote after startup and every 72 hours thereafter. */
export function startProjectUpdateCheckScheduler(): void {
  if (autoCheckSchedulerStarted) {return}
  autoCheckSchedulerStarted = true

  const schedule = (delay: number) => {
    const timer = setTimeout(async () => {
      try {
        const info = await getProjectUpdateInfo(true)
        if (info.gitRepository && info.repositoryValid && info.checkedAt) {
          logger.info(
            { updateAvailable: info.updateAvailable, commitsBehind: info.commitsBehind },
            'Automatic project update check completed'
          )
        }
      } catch (error) {
        logger.warn({ error }, 'Automatic project update check failed')
      } finally {
        schedule(AUTO_CHECK_INTERVAL_MS)
      }
    }, delay)
    timer.unref()
  }

  schedule(AUTO_CHECK_START_DELAY_MS)
}

const idleStatus: UpdateJobStatus = {
  jobId: null,
  state: 'idle',
  stage: 'idle',
  message: '尚未执行更新',
  startedAt: null,
  updatedAt: null,
  completedAt: null,
  logs: [],
}

export async function getProjectUpdateStatus(): Promise<UpdateJobStatus> {
  try {
    const raw = await fsPromises.readFile(STATUS_FILE, 'utf8')
    return { ...idleStatus, ...(JSON.parse(raw) as UpdateJobStatus) }
  } catch {
    return idleStatus
  }
}

async function writeStatus(status: UpdateJobStatus): Promise<void> {
  await fsPromises.mkdir(path.dirname(STATUS_FILE), { recursive: true })
  await fsPromises.writeFile(STATUS_FILE, JSON.stringify(status, null, 2), 'utf8')
}

export async function startProjectUpdate(): Promise<UpdateJobStatus> {
  const currentStatus = await getProjectUpdateStatus()
  if (currentStatus.state === 'running' || currentStatus.state === 'restarting') {
    throw new Error('update_already_running')
  }

  const info = await getProjectUpdateInfo(true)
  if (!info.canUpdate || !info.currentCommit || !info.remoteCommit) {
    throw new Error(info.blocker || 'update_not_available')
  }

  const runnerPath = path.resolve(__dirname, '../scripts/projectUpdateRunner.js')
  if (!fs.existsSync(runnerPath)) {
    throw new Error('update_runner_not_built')
  }

  const now = new Date().toISOString()
  const status: UpdateJobStatus = {
    jobId: randomUUID(),
    state: 'running',
    stage: 'queued',
    message: '更新任务已创建',
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    fromCommit: info.currentCommit,
    toCommit: info.remoteCommit,
    logs: [],
  }
  await writeStatus(status)

  const payload = Buffer.from(JSON.stringify({
    jobId: status.jobId,
    repoRoot: REPO_ROOT,
    branch: info.branch,
    previousCommit: info.currentCommit,
    targetCommit: info.remoteCommit,
    statusFile: STATUS_FILE,
    pm2Target: process.env.PM2_PROCESS_NAME || process.env.name || 'official-backend',
    healthUrl: process.env.UPDATE_HEALTH_URL || `http://127.0.0.1:${process.env.PORT || 3000}/health/ready`,
  })).toString('base64url')

  const child = require('child_process').spawn(process.execPath, [runnerPath, payload], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: process.env,
  })
  child.unref()
  return status
}
