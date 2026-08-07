import { spawnSync } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

interface RunnerPayload {
  jobId: string
  repoRoot: string
  branch: string
  previousCommit: string
  targetCommit: string
  statusFile: string
  pm2Target: string
  healthUrl: string
  artifactUrl?: string
  githubToken?: string
}

interface RunnerStatus {
  jobId: string
  state: 'running' | 'restarting' | 'completed' | 'failed'
  stage: string
  message: string
  startedAt: string
  updatedAt: string
  completedAt: string | null
  fromCommit: string
  toCommit: string
  logs: string[]
}

const payloadRaw = process.argv[2]
if (!payloadRaw) process.exit(1)

const payload = JSON.parse(Buffer.from(payloadRaw, 'base64url').toString('utf8')) as RunnerPayload
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const pm2Command = process.platform === 'win32' ? 'pm2.cmd' : 'pm2'
const startedAt = new Date().toISOString()
let logs: string[] = []
let merged = false
let artifactBackupDir: string | null = null
let artifactApplied = false

function appendLog(message: string): void {
  const clean = message.trim().replace(/\u001b\[[0-9;]*m/g, '')
  if (clean) logs = [...logs, clean.slice(-2000)].slice(-40)
}

async function writeStatus(patch: Partial<RunnerStatus>): Promise<void> {
  const status: RunnerStatus = {
    jobId: payload.jobId,
    state: 'running',
    stage: 'starting',
    message: 'Preparing update',
    startedAt,
    updatedAt: new Date().toISOString(),
    completedAt: null,
    fromCommit: payload.previousCommit,
    toCommit: payload.targetCommit,
    logs,
    ...patch,
  }
  const tempFile = `${payload.statusFile}.${process.pid}.tmp`
  await fs.mkdir(path.dirname(payload.statusFile), { recursive: true })
  await fs.writeFile(tempFile, JSON.stringify(status, null, 2), 'utf8')
  await fs.rename(tempFile, payload.statusFile)
}

function run(command: string, args: string[], stage: string, message: string, timeout = 15 * 60_000, cwd = payload.repoRoot): void {
  void writeStatus({ stage, message })
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout,
    maxBuffer: 10 * 1024 * 1024,
    env: process.env,
  })
  appendLog(result.stdout || '')
  appendLog(result.stderr || '')
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (exit ${result.status})`)
}

async function waitForHealth(timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError = 'health check timed out'
  while (Date.now() < deadline) {
    try {
      const response = await fetch(payload.healthUrl, { signal: AbortSignal.timeout(5_000) })
      if (response.ok) return
      lastError = `health endpoint returned HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise(resolve => setTimeout(resolve, 2_000))
  }
  throw new Error(`server health check failed: ${lastError}`)
}

async function downloadArtifact(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15 * 60_000),
    headers: {
      accept: 'application/octet-stream',
      ...(payload.githubToken ? { authorization: `Bearer ${payload.githubToken}` } : {}),
    },
  })
  if (!response.ok) throw new Error(`deployment package download failed (HTTP ${response.status})`)
  const archivePath = path.join(os.tmpdir(), `carradioweb-${payload.jobId}.tar.gz`)
  await fs.writeFile(archivePath, Buffer.from(await response.arrayBuffer()))
  return archivePath
}

async function moveIntoBackup(relativePath: string): Promise<void> {
  if (!artifactBackupDir) throw new Error('artifact backup directory is not initialized')
  const current = path.join(payload.repoRoot, relativePath)
  const backup = path.join(artifactBackupDir, relativePath)
  await fs.mkdir(path.dirname(backup), { recursive: true })
  try {
    await fs.rename(current, backup)
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error
  }
}

async function applyArtifact(): Promise<void> {
  if (!payload.artifactUrl) throw new Error('deployment package URL is not configured')
  const stagingDir = path.join(payload.repoRoot, `.update-staging-${payload.jobId}`)
  artifactBackupDir = path.join(payload.repoRoot, `.update-backup-${payload.jobId}`)
  await fs.rm(stagingDir, { recursive: true, force: true })
  await fs.rm(artifactBackupDir, { recursive: true, force: true })
  await fs.mkdir(stagingDir, { recursive: true })

  const archivePath = await downloadArtifact(payload.artifactUrl)
  try {
    run('tar', ['-xzf', archivePath, '-C', stagingDir], 'extracting', 'Extracting the prebuilt deployment package', 5 * 60_000)
  } finally {
    await fs.rm(archivePath, { force: true })
  }

  for (const relative of ['dist', path.join('backend', 'dist'), path.join('backend', 'node_modules')]) {
    try { await fs.access(path.join(stagingDir, relative)) } catch { throw new Error(`deployment package is incomplete: ${relative}`) }
  }

  run(pm2Command, ['stop', payload.pm2Target], 'stopping', 'Stopping the backend service', 2 * 60_000)
  for (const relative of ['dist', path.join('backend', 'dist'), path.join('backend', 'node_modules'), 'package.json', 'package-lock.json', 'release.json']) {
    await moveIntoBackup(relative)
    const staged = path.join(stagingDir, relative)
    const current = path.join(payload.repoRoot, relative)
    try {
      await fs.mkdir(path.dirname(current), { recursive: true })
      await fs.rename(staged, current)
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  artifactApplied = true
  await fs.rm(stagingDir, { recursive: true, force: true })
}

async function rollbackArtifact(reason: string): Promise<boolean> {
  if (!artifactBackupDir || !artifactApplied) return false
  try {
    run(pm2Command, ['stop', payload.pm2Target], 'rollback', 'Restoring the previous deployment package', 2 * 60_000)
    for (const relative of ['dist', path.join('backend', 'dist'), path.join('backend', 'node_modules'), 'package.json', 'package-lock.json', 'release.json']) {
      const backup = path.join(artifactBackupDir, relative)
      const current = path.join(payload.repoRoot, relative)
      try {
        await fs.rm(current, { recursive: true, force: true })
        await fs.rename(backup, current)
      } catch (error: any) {
        if (error?.code !== 'ENOENT') throw error
      }
    }
    run(pm2Command, ['restart', payload.pm2Target, '--update-env'], 'rollback_restart', 'Restarting the previous version', 2 * 60_000)
    await waitForHealth()
    await fs.rm(artifactBackupDir, { recursive: true, force: true })
    await writeStatus({ state: 'failed', stage: 'rolled_back', message: `Update failed and was rolled back: ${reason}`, completedAt: new Date().toISOString() })
    return true
  } catch (error) {
    appendLog(`Automatic rollback failed: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

async function rollbackLegacy(reason: string): Promise<void> {
  if (!merged) {
    await writeStatus({ state: 'failed', stage: 'failed', message: reason, completedAt: new Date().toISOString() })
    return
  }
  try {
    run('git', ['reset', '--hard', payload.previousCommit], 'rollback', 'Restoring the previous source revision')
    run(npmCommand, ['ci', '--include=dev', '--no-audit', '--no-fund'], 'rollback_dependencies', 'Restoring frontend dependencies')
    run(npmCommand, ['ci', '--include=dev', '--no-audit', '--no-fund'], 'rollback_backend_dependencies', 'Restoring backend dependencies', 15 * 60_000, path.join(payload.repoRoot, 'backend'))
    run(npmCommand, ['run', 'build'], 'rollback_build', 'Rebuilding the previous version', 20 * 60_000)
    run(pm2Command, ['restart', payload.pm2Target, '--update-env'], 'rollback_restart', 'Restarting the previous version', 2 * 60_000)
    await waitForHealth()
    await writeStatus({ state: 'failed', stage: 'rolled_back', message: `Update failed and was rolled back: ${reason}`, completedAt: new Date().toISOString() })
  } catch (error) {
    await writeStatus({ state: 'failed', stage: 'rollback_failed', message: `Update failed and rollback failed: ${error instanceof Error ? error.message : String(error)}`, completedAt: new Date().toISOString() })
  }
}

async function main(): Promise<void> {
  try {
    if (payload.artifactUrl) {
      await writeStatus({ stage: 'downloading', message: 'Downloading the prebuilt package from GitHub' })
      await applyArtifact()
      run(pm2Command, ['restart', payload.pm2Target, '--update-env'], 'restarting', 'Restarting the backend service', 2 * 60_000)
      await writeStatus({ stage: 'health_check', message: 'Checking the new version health' })
      await waitForHealth()
      if (artifactBackupDir) await fs.rm(artifactBackupDir, { recursive: true, force: true })
      await writeStatus({ state: 'completed', stage: 'completed', message: 'Update completed successfully', completedAt: new Date().toISOString() })
      return
    }

    run('git', ['fetch', '--quiet', 'origin', payload.branch], 'fetching', 'Fetching the latest source revision', 2 * 60_000)
    const fetched = spawnSync('git', ['rev-parse', `origin/${payload.branch}`], { cwd: payload.repoRoot, encoding: 'utf8' })
    if (fetched.status !== 0 || fetched.stdout.trim() !== payload.targetCommit) throw new Error('remote revision changed; check for updates again')
    run('git', ['merge', '--ff-only', payload.targetCommit], 'updating_code', 'Updating source code')
    merged = true
    run(npmCommand, ['ci', '--include=dev', '--no-audit', '--no-fund'], 'installing_frontend', 'Installing frontend dependencies')
    run(npmCommand, ['ci', '--include=dev', '--no-audit', '--no-fund'], 'installing_backend', 'Installing backend dependencies', 15 * 60_000, path.join(payload.repoRoot, 'backend'))
    run(npmCommand, ['run', 'build'], 'building', 'Building the new version', 20 * 60_000)
    run(pm2Command, ['restart', payload.pm2Target, '--update-env'], 'restarting', 'Restarting the backend service', 2 * 60_000)
    await waitForHealth()
    await writeStatus({ state: 'completed', stage: 'completed', message: 'Update completed successfully', completedAt: new Date().toISOString() })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    appendLog(reason)
    if (!(await rollbackArtifact(reason))) await rollbackLegacy(reason)
    process.exitCode = 1
  }
}

void main()
