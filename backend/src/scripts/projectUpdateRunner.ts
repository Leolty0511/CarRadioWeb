import { spawn, spawnSync } from 'child_process'
import { createWriteStream } from 'fs'
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
let dataBackupDir: string | null = null
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
const backupEnabled = process.env.UPDATE_BACKUP_ENABLED === 'true' || (process.env.NODE_ENV === 'production' && process.env.UPDATE_BACKUP_ENABLED !== 'false')
const backupRequired = process.env.UPDATE_BACKUP_REQUIRED !== 'false'
const backupRoot = path.resolve(process.env.UPDATE_BACKUP_DIR?.trim() || path.join(payload.repoRoot, '.update-backups'))
const backupRetentionCount = Math.max(1, Number.parseInt(process.env.UPDATE_BACKUP_RETENTION_COUNT || '7', 10) || 7)

interface BackupManifestItem {
  name: string
  status: 'completed' | 'skipped' | 'failed'
  path?: string
  method?: string
  error?: string
}

interface BackupManifest {
  jobId: string
  fromCommit: string
  targetCommit: string
  createdAt: string
  items: BackupManifestItem[]
}

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

function commandAvailable(command: string): boolean {
  const result = spawnSync(command, ['--version'], {
    stdio: 'ignore',
    windowsHide: true,
    timeout: 10_000,
  })
  return !result.error && result.status === 0
}

async function runCaptureToFile(command: string, args: string[], outputFile: string, timeout = 30 * 60_000, cwd = payload.repoRoot, env?: NodeJS.ProcessEnv): Promise<void> {
  await fs.mkdir(path.dirname(outputFile), { recursive: true })
  await writeStatus({ stage: 'backing_up', message: `Running ${command} backup` })
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      env: env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const output = createWriteStream(outputFile, { flags: 'wx' })
    let stderr = ''
    let settled = false
    let exitCode: number | null = null
    let outputFinished = false
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref()
      finish(new Error(`${command} backup timed out`))
    }, timeout)
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) output.destroy()
      if (error) reject(error)
      else resolve()
    }
    const maybeFinish = (): void => {
      if (exitCode === 0 && outputFinished) finish()
    }
    child.stdout.pipe(output)
    child.stderr.on('data', chunk => {
      stderr = `${stderr}${chunk.toString('utf8')}`.slice(-2_000)
    })
    output.on('error', error => {
      child.kill('SIGTERM')
      finish(error)
    })
    output.on('finish', () => {
      outputFinished = true
      maybeFinish()
    })
    child.on('error', error => finish(error))
    child.on('close', code => {
      exitCode = code
      if (code === 0) maybeFinish()
      else {
        const detail = stderr.replace(/(password|pwd|secret)\s*[:=]?\s*[^\s]+/gi, '$1=[redacted]').trim()
        finish(new Error(`${command} backup failed (exit ${code})${detail ? `: ${detail}` : ''}`))
      }
    })
  })
}

async function runCommand(command: string, args: string[], timeout = 30 * 60_000, cwd = payload.repoRoot, env?: NodeJS.ProcessEnv): Promise<void> {
  await writeStatus({ stage: 'backing_up', message: `Running ${command} backup` })
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, env: env || process.env, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref()
      finish(new Error(`${command} command timed out`))
    }, timeout)
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve()
    }
    child.stderr.on('data', chunk => { stderr = `${stderr}${chunk.toString('utf8')}`.slice(-2_000) })
    child.on('error', error => finish(error))
    child.on('close', code => {
      if (code === 0) finish()
      else {
        const detail = stderr.replace(/(password|pwd|secret)\s*[:=]?\s*[^\s]+/gi, '$1=[redacted]').trim()
        finish(new Error(`${command} command failed (exit ${code})${detail ? `: ${detail}` : ''}`))
      }
    })
  })
}

async function backupMongoDatabase(directory: string): Promise<BackupManifestItem> {
  const output = path.join(directory, 'mongodb.archive.gz')
  const uri = process.env.MONGODB_URI?.trim()
  try {
    if (commandAvailable('mongodump') && uri) {
      await runCommand('mongodump', [`--uri=${uri}`, `--archive=${output}`, '--gzip'])
      return { name: 'mongodb', status: 'completed', path: 'mongodb.archive.gz', method: 'mongodump' }
    }
    const docker = process.env.UPDATE_DOCKER_COMMAND?.trim() || 'docker'
    const container = process.env.UPDATE_MONGO_CONTAINER?.trim()
    if (container && commandAvailable(docker)) {
      const database = process.env.UPDATE_MONGO_DATABASE?.trim() || 'knowledge-base'
      const args = ['exec', container, 'mongodump', `--db=${database}`, '--archive', '--gzip']
      const username = process.env.UPDATE_MONGO_USERNAME?.trim()
      const password = process.env.UPDATE_MONGO_PASSWORD
      if (username) args.push(`--username=${username}`)
      if (password) args.push(`--password=${password}`, '--authenticationDatabase=admin')
      await runCaptureToFile(docker, args, output)
      return { name: 'mongodb', status: 'completed', path: 'mongodb.archive.gz', method: 'docker exec mongodump' }
    }
    throw new Error('mongodump is unavailable or MONGODB_URI is not configured; set Mongo backup tools or UPDATE_MONGO_CONTAINER')
  } catch (error) {
    return { name: 'mongodb', status: 'failed', path: 'mongodb.archive.gz', error: error instanceof Error ? error.message : String(error) }
  }
}

async function backupFlarumDatabase(directory: string): Promise<BackupManifestItem> {
  const output = path.join(directory, 'flarum.sql')
  const host = process.env.UPDATE_FLARUM_DB_HOST?.trim() || '127.0.0.1'
  const port = process.env.UPDATE_FLARUM_DB_PORT?.trim() || '3306'
  const database = process.env.UPDATE_FLARUM_DB_NAME?.trim() || 'flarum'
  const user = process.env.UPDATE_FLARUM_DB_USER?.trim() || 'flarum'
  const password = process.env.UPDATE_FLARUM_DB_PASSWORD
  try {
    const localDump = commandAvailable('mariadb-dump') ? 'mariadb-dump' : commandAvailable('mysqldump') ? 'mysqldump' : null
    if (localDump) {
      await runCaptureToFile(localDump, ['--host', host, '--port', port, '--user', user, database], output, 30 * 60_000, payload.repoRoot, { ...process.env, ...(password ? { MYSQL_PWD: password } : {}) })
      return { name: 'flarumDatabase', status: 'completed', path: 'flarum.sql', method: `${localDump} (streamed)` }
    }
    const docker = process.env.UPDATE_DOCKER_COMMAND?.trim() || 'docker'
    const container = process.env.UPDATE_FLARUM_DB_CONTAINER?.trim()
    if (container && commandAvailable(docker)) {
      const dumpCommand = process.env.UPDATE_FLARUM_DUMP_COMMAND?.trim() || 'mariadb-dump'
      const args = ['exec']
      if (password) args.push('-e', `MYSQL_PWD=${password}`)
      args.push(container, dumpCommand, '--host', host === '127.0.0.1' ? '127.0.0.1' : host, '--port', port, '--user', user, database)
      await runCaptureToFile(docker, args, output)
      return { name: 'flarumDatabase', status: 'completed', path: 'flarum.sql', method: `docker exec ${dumpCommand} (streamed)` }
    }
    throw new Error('mariadb-dump/mysqldump is unavailable and UPDATE_FLARUM_DB_CONTAINER is not configured')
  } catch (error) {
    return { name: 'flarumDatabase', status: 'failed', path: 'flarum.sql', error: error instanceof Error ? error.message : String(error) }
  }
}

async function backupDirectory(name: string, source: string, directory: string, required = true): Promise<BackupManifestItem> {
  const target = path.join(directory, name)
  try {
    const relativeTarget = path.relative(path.resolve(source), path.resolve(target))
    if (!relativeTarget || (!relativeTarget.startsWith(`..${path.sep}`) && relativeTarget !== '..' && !path.isAbsolute(relativeTarget))) {
      throw new Error(`backup target must not be inside source directory: ${target}`)
    }
    await fs.access(source)
    await fs.cp(source, target, { recursive: true, force: true })
    return { name, status: 'completed', path: name, method: 'filesystem copy' }
  } catch (error: any) {
    if (error?.code === 'ENOENT' && !required) return { name, status: 'skipped', path: name, method: 'source missing' }
    return { name, status: 'failed', path: name, error: error instanceof Error ? error.message : String(error) }
  }
}

async function pruneDataBackups(): Promise<void> {
  let entries: string[] = []
  try { entries = await fs.readdir(backupRoot) } catch (error: any) { if (error?.code === 'ENOENT') return; throw error }
  const backups = (await Promise.all(entries.filter(entry => /^backup-[A-Za-z0-9._-]+$/.test(entry)).map(async entry => {
    const full = path.join(backupRoot, entry)
    const stat = await fs.stat(full).catch(() => null)
    return stat?.isDirectory() ? { full, mtime: stat.mtimeMs } : null
  }))).filter((entry): entry is { full: string; mtime: number } => Boolean(entry)).sort((a, b) => b.mtime - a.mtime)
  await Promise.all(backups.slice(backupRetentionCount).map(entry => fs.rm(entry.full, { recursive: true, force: true })))
}

async function createDataBackup(): Promise<void> {
  if (!backupEnabled) {
    appendLog('Pre-update data backup disabled outside production')
    return
  }
  const safeJobId = payload.jobId.replace(/[^A-Za-z0-9._-]/g, '_')
  dataBackupDir = path.join(backupRoot, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${safeJobId}`)
  await fs.mkdir(dataBackupDir, { recursive: true })
  const items: BackupManifestItem[] = []
  const manifestPath = path.join(dataBackupDir, 'backup-manifest.json')
  const writeManifest = async (): Promise<void> => {
    const manifest: BackupManifest = { jobId: payload.jobId, fromCommit: payload.previousCommit, targetCommit: payload.targetCommit, createdAt: startedAt, items }
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  }
  items.push(await backupMongoDatabase(dataBackupDir))
  items.push(await backupFlarumDatabase(dataBackupDir))
  items.push(await backupDirectory('uploads', process.env.UPDATE_UPLOADS_PATH?.trim() || path.join(payload.repoRoot, 'backend', 'uploads'), dataBackupDir, false))
  const flarumDataPath = process.env.UPDATE_FLARUM_DATA_PATH?.trim()
  if (flarumDataPath) {
    items.push(await backupDirectory('flarum-data', flarumDataPath, dataBackupDir, false))
  } else {
    const docker = process.env.UPDATE_DOCKER_COMMAND?.trim() || 'docker'
    const container = process.env.UPDATE_FLARUM_CONTAINER?.trim()
    const target = path.join(dataBackupDir, 'flarum-data')
    if (container && commandAvailable(docker)) {
      try {
        await runCommand(docker, ['cp', `${container}:/data`, target])
        items.push({ name: 'flarumData', status: 'completed', path: 'flarum-data', method: 'docker cp' })
      } catch (error) {
        items.push({ name: 'flarumData', status: 'failed', path: 'flarum-data', error: error instanceof Error ? error.message : String(error) })
      }
    } else {
      items.push({ name: 'flarumData', status: 'skipped', method: 'not configured' })
    }
  }
  await writeManifest()
  const failures = items.filter(item => item.status === 'failed')
  if (failures.length > 0) {
    const message = `Pre-update data backup failed: ${failures.map(item => `${item.name}: ${item.error || 'unknown error'}`).join('; ')}`
    if (backupRequired) throw new Error(message)
    appendLog(`${message}; continuing because UPDATE_BACKUP_REQUIRED=false`)
  } else {
    appendLog(`Pre-update data backup completed: ${dataBackupDir}`)
  }
  await pruneDataBackups()
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
    await createDataBackup()
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
