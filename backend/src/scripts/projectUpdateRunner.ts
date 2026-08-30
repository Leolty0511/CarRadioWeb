import { spawnSync } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'

interface RunnerPayload {
  jobId: string
  repoRoot: string
  branch: string
  previousCommit: string
  targetCommit: string
  statusFile: string
  pm2Target: string
  frontendPm2Target?: string
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
let forumBridgeChanged = false
const artifactPaths = [
  'dist',
  path.join('backend', 'dist'),
  path.join('backend', 'node_modules'),
  path.join('backend', 'package.json'),
  path.join('backend', 'package-lock.json'),
  'release.json',
  'package.json',
  'package-lock.json',
  'ecosystem.config.cjs',
  'docker-compose.flarum.yml',
  'forum-extensions',
  path.join('scripts', 'deploy-flarum.sh'),
  path.join('scripts', 'deploy-flarum.ps1'),
  path.join('scripts', 'cancel-deploy.sh'),
  path.join('scripts', 'cancel-deploy.ps1'),
  path.join('scripts', 'ensure-docker.sh'),
  path.join('scripts', 'install-forum-bridge.sh'),
]
const stableDirectoryPaths = new Set(['forum-extensions'])

function getCommandEnvironment(command: string): NodeJS.ProcessEnv {
  const token = payload.githubToken?.trim()
  if (command !== 'git' || !token) return process.env
  return {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
  }
}

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

async function run(command: string, args: string[], stage: string, message: string, timeout = 15 * 60_000, cwd = payload.repoRoot): Promise<void> {
  await writeStatus({ stage, message })
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout,
    maxBuffer: 10 * 1024 * 1024,
    env: getCommandEnvironment(command),
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

/**
 * Refresh the frontend after replacing the built assets. Deployments may run
 * the frontend under PM2, behind nginx, or from the same backend process.
 * Keep the update usable in all three layouts while recording what happened.
 */
async function restartFrontend(): Promise<void> {
  if (payload.frontendPm2Target && payload.frontendPm2Target !== payload.pm2Target) {
    try {
      await run(pm2Command, ['restart', payload.frontendPm2Target, '--update-env'], 'restarting_frontend', 'Restarting the frontend service', 2 * 60_000)
      return
    } catch (error) {
      appendLog(`Frontend PM2 restart unavailable: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  try {
    await run('nginx', ['-s', 'reload'], 'reloading_frontend', 'Reloading the frontend proxy', 30_000)
    return
  } catch (error) {
    appendLog(`Nginx reload unavailable: ${error instanceof Error ? error.message : String(error)}`)
  }

  // The built frontend is also served by the backend in the standard package.
  // Backend restart below reloads those files, so this is a valid no-op when
  // no separate frontend process or nginx instance exists.
  await writeStatus({ stage: 'frontend_refreshed', message: 'Frontend assets updated; no separate frontend process requires a restart' })
}

async function installForumBridge(): Promise<void> {
  if (process.platform === 'win32') return
  try {
    await run('bash', [path.join(payload.repoRoot, 'scripts', 'install-forum-bridge.sh')], 'updating_forum_bridge', 'Updating the forum login bridge', 10 * 60_000)
  } catch (error) {
    appendLog(`Forum bridge update skipped: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function downloadArtifact(url: string): Promise<string> {
  const timeout = AbortSignal.timeout(15 * 60_000)
  const authorizedHeaders = {
    accept: 'application/octet-stream',
    ...(payload.githubToken ? { authorization: `Bearer ${payload.githubToken}` } : {}),
  }
  const unsignedHeaders = { accept: 'application/octet-stream' }
  let currentUrl = url
  let response: Response | undefined

  // Private GitHub release assets redirect to a short-lived signed URL. Do the
  // redirect manually so the bearer token is never sent to the asset host.
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    response = await fetch(currentUrl, {
      redirect: 'manual',
      signal: timeout,
      headers: redirectCount === 0 ? authorizedHeaders : unsignedHeaders,
    })
    if (response.status < 300 || response.status >= 400) break
    const location = response.headers.get('location')
    if (!location) throw new Error(`deployment package redirect missing location (HTTP ${response.status})`)
    currentUrl = new URL(location, currentUrl).toString()
  }
  if (!response) throw new Error('deployment package download returned no response')
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

async function clearDirectory(directory: string): Promise<void> {
  await fs.mkdir(directory, { recursive: true })
  const entries = await fs.readdir(directory)
  await Promise.all(entries.map(entry => fs.rm(path.join(directory, entry), { recursive: true, force: true })))
}

async function directoryFingerprint(directory: string): Promise<string> {
  const hash = crypto.createHash('sha256')
  const walk = async (current: string, relative = ''): Promise<void> => {
    let entries: Array<import('fs').Dirent>
    try { entries = await fs.readdir(current, { withFileTypes: true }) } catch { return }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const rel = path.join(relative, entry.name)
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(full, rel)
      else {
        hash.update(rel)
        hash.update(await fs.readFile(full))
      }
    }
  }
  await walk(directory)
  return hash.digest('hex')
}

async function replaceStableDirectory(relativePath: string, sourceRoot: string, backupCurrent: boolean): Promise<void> {
  if (!artifactBackupDir) throw new Error('artifact backup directory is not initialized')
  const current = path.join(payload.repoRoot, relativePath)
  const source = path.join(sourceRoot, relativePath)
  const backup = path.join(artifactBackupDir, relativePath)

  if (backupCurrent) {
    await fs.rm(backup, { recursive: true, force: true })
    try {
      await fs.cp(current, backup, { recursive: true })
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error
    }
  }

  await clearDirectory(current)
  await fs.cp(source, current, { recursive: true })
  await fs.rm(source, { recursive: true, force: true })
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
    await run('tar', ['-xzf', archivePath, '-C', stagingDir], 'extracting', 'Extracting the prebuilt deployment package', 5 * 60_000)
  } finally {
    await fs.rm(archivePath, { force: true })
  }

  artifactApplied = true
  for (const relative of artifactPaths) {
    try { await fs.access(path.join(stagingDir, relative)) } catch { throw new Error(`deployment package is incomplete: ${relative}`) }
  }

  const stagedRelease = JSON.parse(await fs.readFile(path.join(stagingDir, 'release.json'), 'utf8')) as { commit?: string }
  if (stagedRelease.commit && stagedRelease.commit !== payload.targetCommit) {
    appendLog(`Package commit ${stagedRelease.commit} differs from requested ${payload.targetCommit}; installing the downloaded package`)
  }
  await writeStatus({
    stage: 'updating_artifacts',
    message: 'Applying the prebuilt deployment package',
    toCommit: stagedRelease.commit || payload.targetCommit,
  })

  for (const relative of artifactPaths) {
    if (stableDirectoryPaths.has(relative)) {
      if (relative === 'forum-extensions') {
        forumBridgeChanged = (await directoryFingerprint(path.join(payload.repoRoot, relative))) !==
          (await directoryFingerprint(path.join(stagingDir, relative)))
      }
      await replaceStableDirectory(relative, stagingDir, true)
      continue
    }
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
  await fs.rm(stagingDir, { recursive: true, force: true })
}

async function rollbackArtifact(reason: string): Promise<boolean> {
  if (!artifactBackupDir || !artifactApplied) return false
  try {
    for (const relative of artifactPaths) {
      const backup = path.join(artifactBackupDir, relative)
      const current = path.join(payload.repoRoot, relative)
      try { await fs.access(backup) } catch { continue }
      if (stableDirectoryPaths.has(relative)) {
        await clearDirectory(current)
        await fs.cp(backup, current, { recursive: true })
        continue
      }
      await fs.rm(current, { recursive: true, force: true })
      await fs.rename(backup, current)
    }
    if (merged) await run('git', ['reset', '--hard', payload.previousCommit], 'rollback_code', 'Restoring the previous source revision', 2 * 60_000)
    await restartFrontend()
    await run(pm2Command, ['restart', payload.pm2Target, '--update-env'], 'rollback_restart', 'Restarting the previous version', 2 * 60_000)
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
    await run('git', ['reset', '--hard', payload.previousCommit], 'rollback', 'Restoring the previous source revision')
    await run(npmCommand, ['ci', '--include=dev', '--no-audit', '--no-fund'], 'rollback_dependencies', 'Restoring frontend dependencies')
    await run(npmCommand, ['ci', '--include=dev', '--no-audit', '--no-fund'], 'rollback_backend_dependencies', 'Restoring backend dependencies', 15 * 60_000, path.join(payload.repoRoot, 'backend'))
    await run(npmCommand, ['run', 'build'], 'rollback_build', 'Rebuilding the previous version', 20 * 60_000)
    await restartFrontend()
    await run(pm2Command, ['restart', payload.pm2Target, '--update-env'], 'rollback_restart', 'Restarting the previous version', 2 * 60_000)
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
      if (forumBridgeChanged) {
        await installForumBridge()
      } else {
        await writeStatus({ stage: 'forum_bridge_unchanged', message: 'Forum login bridge unchanged; skipping bridge reinstall' })
      }
      await restartFrontend()
      await run(pm2Command, ['restart', payload.pm2Target, '--update-env'], 'restarting', 'Restarting the backend service', 2 * 60_000)
      await writeStatus({ stage: 'health_check', message: 'Checking the new version health' })
      await waitForHealth()
      if (artifactBackupDir) await fs.rm(artifactBackupDir, { recursive: true, force: true })
      await writeStatus({ state: 'completed', stage: 'completed', message: 'Update completed successfully', completedAt: new Date().toISOString() })
      return
    }

    await run('git', ['fetch', '--quiet', 'origin', payload.branch], 'fetching', 'Fetching the latest source revision', 2 * 60_000)
    const fetched = spawnSync('git', ['rev-parse', `origin/${payload.branch}`], { cwd: payload.repoRoot, encoding: 'utf8' })
    if (fetched.status !== 0 || fetched.stdout.trim() !== payload.targetCommit) throw new Error('remote revision changed; check for updates again')
    await run('git', ['merge', '--ff-only', payload.targetCommit], 'updating_code', 'Updating source code')
    merged = true
    await run(npmCommand, ['ci', '--include=dev', '--no-audit', '--no-fund'], 'installing_frontend', 'Installing frontend dependencies')
    await run(npmCommand, ['ci', '--include=dev', '--no-audit', '--no-fund'], 'installing_backend', 'Installing backend dependencies', 15 * 60_000, path.join(payload.repoRoot, 'backend'))
    await run(npmCommand, ['run', 'build'], 'building', 'Building the new version', 20 * 60_000)
    await restartFrontend()
    await run(pm2Command, ['restart', payload.pm2Target, '--update-env'], 'restarting', 'Restarting the backend service', 2 * 60_000)
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
