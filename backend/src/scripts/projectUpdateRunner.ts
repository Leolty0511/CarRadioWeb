import { spawn, spawnSync } from 'child_process'
import { createWriteStream } from 'fs'
import { promises as fs } from 'fs'
import dotenv from 'dotenv'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { createGzip } from 'zlib'
import mongoose from 'mongoose'
import { discoverDockerContainer, mongoDatabaseFromUri, readDockerComposeService } from '../utils/updateBackupDiscovery'

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
  artifactFile?: string
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
// The updater can run from a temporary release directory. Load connection
// settings from the target checkout and discard inherited database overrides,
// while preserving safety flags explicitly supplied by the updater command.
const runnerControlKeys = ['NODE_ENV', 'UPDATE_BACKUP_ENABLED', 'UPDATE_BACKUP_REQUIRED', 'UPDATE_RUNNER_CONSOLE'] as const
const runnerControls = Object.fromEntries(runnerControlKeys.map(key => [key, process.env[key]]))
for (const key of Object.keys(process.env)) {
  if (key === 'MONGODB_URI' || key === 'DB_PASSWORD' || key === 'FLARUM_DB_PASSWORD' || /^UPDATE_(MONGO|FLARUM)_/.test(key)) {
    delete process.env[key]
  }
}
const targetEnvironment: Record<string, string> = {}
dotenv.config({ path: path.join(payload.repoRoot, 'backend', 'config.env'), processEnv: targetEnvironment })
Object.assign(process.env, targetEnvironment)
for (const key of runnerControlKeys) {
  const value = runnerControls[key]
  if (value !== undefined) process.env[key] = value
}
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
  path.join('scripts', 'install-latest-release.sh'),
]
const stableDirectoryPaths = new Set(['forum-extensions'])
const backupEnabled = process.env.UPDATE_BACKUP_ENABLED === 'true' || (process.env.NODE_ENV === 'production' && process.env.UPDATE_BACKUP_ENABLED !== 'false')
const backupRequired = process.env.UPDATE_BACKUP_REQUIRED !== 'false'
const backupRoot = path.resolve(process.env.UPDATE_BACKUP_DIR?.trim() || path.join(payload.repoRoot, '.update-backups'))
const backupRetentionCount = Math.max(1, Number.parseInt(process.env.UPDATE_BACKUP_RETENTION_COUNT || '7', 10) || 7)
const mongoBackupBatchSize = Math.min(100, Math.max(10, Number.parseInt(process.env.UPDATE_MONGO_BACKUP_BATCH_SIZE || '25', 10) || 25))
const mongoBackupThrottleMs = Math.min(1_000, Math.max(0, Number.parseInt(process.env.UPDATE_MONGO_BACKUP_THROTTLE_MS || '10', 10) || 0))
const backupMaxBytesPerSecond = Math.min(
  64 * 1024 * 1024,
  Math.max(1024 * 1024, Number.parseInt(process.env.UPDATE_BACKUP_MAX_BYTES_PER_SECOND || `${8 * 1024 * 1024}`, 10) || 8 * 1024 * 1024)
)
let lastConsoleStatus = ''

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
  const consoleStatus = `[${status.stage}] ${status.message}`
  if (process.env.UPDATE_RUNNER_CONSOLE === 'true' && consoleStatus !== lastConsoleStatus) {
    console.log(consoleStatus)
    lastConsoleStatus = consoleStatus
  }
}

function createBackupThrottle(): Transform {
  let availableAt = Date.now()
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      const now = Date.now()
      const delay = Math.max(0, availableAt - now)
      availableAt = Math.max(now, availableAt) + (chunk.length / backupMaxBytesPerSecond) * 1_000
      setTimeout(() => callback(null, chunk), delay)
    },
  })
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

async function readEnvFileValue(filePath: string, key: string): Promise<string | undefined> {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const line = content.split(/\r?\n/).find(candidate => candidate.trimStart().startsWith(`${key}=`))
    if (!line) return undefined
    const value = line.slice(line.indexOf('=') + 1).trim()
    if (!value) return undefined
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1)
    }
    return value
  } catch (error: any) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

async function runCaptureToFile(
  command: string,
  args: string[],
  outputFile: string,
  timeout = 30 * 60_000,
  cwd = payload.repoRoot,
  env?: NodeJS.ProcessEnv,
  statusMessage = `正在执行 ${command} 流式备份`
): Promise<void> {
  await fs.mkdir(path.dirname(outputFile), { recursive: true })
  await writeStatus({ stage: 'backing_up', message: statusMessage })
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
    const throttle = createBackupThrottle()
    child.stdout.pipe(throttle).pipe(output)
    child.stderr.on('data', chunk => {
      stderr = `${stderr}${chunk.toString('utf8')}`.slice(-2_000)
    })
    output.on('error', error => {
      child.kill('SIGTERM')
      finish(error)
    })
    throttle.on('error', error => {
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

async function backupMongoDatabase(directory: string): Promise<BackupManifestItem> {
  const archiveOutput = path.join(directory, 'mongodb.archive.gz')
  const uri = process.env.MONGODB_URI?.trim()
  const failures: string[] = []
  if (uri) {
    const streamOutput = path.join(directory, 'mongodb.ejson.ndjson.gz')
    const client = new mongoose.mongo.MongoClient(uri, {
      maxPoolSize: 1,
      minPoolSize: 0,
      maxConnecting: 1,
      serverSelectionTimeoutMS: 10_000,
    })
    try {
      await writeStatus({ stage: 'backing_up_mongodb', message: '正在以低资源模式连接 MongoDB' })
      await client.connect()
      const db = client.db()
      const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
        .filter(collectionInfo => collectionInfo.type === 'collection')
      let exportedDocuments = 0
      let lastProgressUpdate = 0
      const exportRows = async function* (): AsyncGenerator<string> {
        yield `${mongoose.mongo.BSON.EJSON.stringify({ type: 'manifest', format: 'carradioweb-mongodb-ejson-v1', database: db.databaseName, createdAt: new Date() }, { relaxed: false })}\n`
        for (const [collectionIndex, collectionInfo] of collections.entries()) {
          const collection = db.collection(collectionInfo.name)
          const indexes = await collection.indexes()
          yield `${mongoose.mongo.BSON.EJSON.stringify({ type: 'collection', collection: collectionInfo.name, indexes }, { relaxed: false })}\n`
          let collectionDocuments = 0
          for await (const document of collection.find({}).batchSize(mongoBackupBatchSize)) {
            yield `${mongoose.mongo.BSON.EJSON.stringify({ type: 'document', collection: collectionInfo.name, document }, { relaxed: false })}\n`
            exportedDocuments += 1
            collectionDocuments += 1
            if (collectionDocuments % mongoBackupBatchSize === 0 && mongoBackupThrottleMs > 0) {
              await new Promise(resolve => setTimeout(resolve, mongoBackupThrottleMs))
            }
            if (Date.now() - lastProgressUpdate >= 15_000) {
              lastProgressUpdate = Date.now()
              await writeStatus({
                stage: 'backing_up_mongodb',
                message: `低资源备份 MongoDB：集合 ${collectionIndex + 1}/${collections.length}，已导出 ${exportedDocuments} 条`,
              })
            }
          }
        }
      }
      await pipeline(
        Readable.from(exportRows(), { highWaterMark: 1 }),
        createGzip({ level: 1 }),
        createBackupThrottle(),
        createWriteStream(streamOutput, { flags: 'wx' })
      )
      return { name: 'mongodb', status: 'completed', path: 'mongodb.ejson.ndjson.gz', method: 'MongoDB driver EJSON stream (low resource)' }
    } catch (error) {
      failures.push(`MongoDB driver stream: ${error instanceof Error ? error.message : String(error)}`)
      await fs.rm(streamOutput, { force: true })
    } finally {
      await client.close().catch(() => undefined)
    }
  }

  const docker = process.env.UPDATE_DOCKER_COMMAND?.trim() || 'docker'
  const mongoContainer = commandAvailable(docker) ? discoverDockerContainer({
    docker,
    repoRoot: payload.repoRoot,
    kind: 'mongo',
    explicitName: process.env.UPDATE_MONGO_CONTAINER,
  }) : null
  if (mongoContainer) {
    try {
      const database = process.env.UPDATE_MONGO_DATABASE?.trim() || mongoDatabaseFromUri(uri) || mongoContainer.environment.MONGO_INITDB_DATABASE
      if (!database) throw new Error('MongoDB database name is unavailable in local configuration and container environment')
      const args = ['exec', mongoContainer.name, 'mongodump', `--db=${database}`, '--archive', '--gzip', '--numParallelCollections=1']
      const username = process.env.UPDATE_MONGO_USERNAME?.trim() || mongoContainer.environment.MONGO_INITDB_ROOT_USERNAME
      const password = process.env.UPDATE_MONGO_PASSWORD || mongoContainer.environment.MONGO_INITDB_ROOT_PASSWORD
      if (username) args.push(`--username=${username}`)
      if (password) args.push(`--password=${password}`)
      if (username) args.push(`--authenticationDatabase=${process.env.UPDATE_MONGO_AUTH_DATABASE?.trim() || 'admin'}`)
      await runCaptureToFile(docker, args, archiveOutput, 30 * 60_000, payload.repoRoot, undefined, '正在以单集合模式备份 MongoDB（Docker 兜底）')
      return { name: 'mongodb', status: 'completed', path: 'mongodb.archive.gz', method: 'docker exec mongodump' }
    } catch (error) {
      failures.push(`Docker mongodump: ${error instanceof Error ? error.message : String(error)}`)
      await fs.rm(archiveOutput, { force: true })
    }
  }

  const unavailable = 'MONGODB_URI is not configured and no running MongoDB container could be detected'
  return { name: 'mongodb', status: 'failed', error: failures.length > 0 ? failures.join('; ') : unavailable }
}

async function backupFlarumDatabase(directory: string): Promise<BackupManifestItem> {
  const output = path.join(directory, 'flarum.sql')
  const flarumEnvPath = path.join(payload.repoRoot, '.env.flarum')
  const flarumComposePath = path.join(payload.repoRoot, 'docker-compose.flarum.yml')
  const docker = process.env.UPDATE_DOCKER_COMMAND?.trim() || 'docker'
  const dockerAvailable = commandAvailable(docker)
  const composeFlarum = dockerAvailable
    ? readDockerComposeService(docker, payload.repoRoot, flarumComposePath, flarumEnvPath, 'flarum')
    : null
  const composeDatabase = dockerAvailable
    ? readDockerComposeService(docker, payload.repoRoot, flarumComposePath, flarumEnvPath, 'db')
    : null
  const envFileHost = await readEnvFileValue(flarumEnvPath, 'DB_HOST')
  const envFilePort = await readEnvFileValue(flarumEnvPath, 'DB_PORT')
  const envFileDatabase = await readEnvFileValue(flarumEnvPath, 'DB_NAME')
  const envFileUser = await readEnvFileValue(flarumEnvPath, 'DB_USER')
  const envFilePassword = await readEnvFileValue(flarumEnvPath, 'DB_PASSWORD')
  const host = process.env.UPDATE_FLARUM_DB_HOST?.trim() || '127.0.0.1'
  const port = process.env.UPDATE_FLARUM_DB_PORT?.trim() || envFilePort || composeFlarum?.environment.DB_PORT || '3306'
  const configuredDatabase = process.env.UPDATE_FLARUM_DB_NAME?.trim() || envFileDatabase || composeFlarum?.environment.DB_NAME || composeDatabase?.environment.MYSQL_DATABASE || composeDatabase?.environment.MARIADB_DATABASE
  const configuredUser = process.env.UPDATE_FLARUM_DB_USER?.trim() || envFileUser || composeFlarum?.environment.DB_USER || composeDatabase?.environment.MYSQL_USER || composeDatabase?.environment.MARIADB_USER
  const configuredPassword = [process.env.UPDATE_FLARUM_DB_PASSWORD, process.env.FLARUM_DB_PASSWORD, process.env.DB_PASSWORD]
    .find(value => typeof value === 'string' && value.length > 0)
    || envFilePassword
    || composeFlarum?.environment.DB_PASSWORD
    || composeDatabase?.environment.MYSQL_PASSWORD
    || composeDatabase?.environment.MARIADB_PASSWORD
  const failures: string[] = []
  const localDump = commandAvailable('mariadb-dump') ? 'mariadb-dump' : commandAvailable('mysqldump') ? 'mysqldump' : null
  if (localDump) {
    try {
      if (!configuredDatabase || !configuredUser) throw new Error('Flarum database name or user is unavailable in local configuration')
      await runCaptureToFile(localDump, ['--single-transaction', '--quick', '--host', host, '--port', port, '--user', configuredUser, configuredDatabase], output, 30 * 60_000, payload.repoRoot, { ...process.env, ...(configuredPassword ? { MYSQL_PWD: configuredPassword } : {}) }, '正在流式备份 Flarum 数据库')
      return { name: 'flarumDatabase', status: 'completed', path: 'flarum.sql', method: `${localDump} (streamed)` }
    } catch (error) {
      failures.push(`local ${localDump}: ${error instanceof Error ? error.message : String(error)}`)
      await fs.rm(output, { force: true })
    }
  }

  const databaseContainer = dockerAvailable ? discoverDockerContainer({
    docker,
    repoRoot: payload.repoRoot,
    kind: 'flarumDatabase',
    explicitName: process.env.UPDATE_FLARUM_DB_CONTAINER || composeDatabase?.containerName || envFileHost || composeFlarum?.environment.DB_HOST,
  }) : null
  if (databaseContainer) {
    try {
      const container = databaseContainer.name
      const database = configuredDatabase || databaseContainer.environment.MYSQL_DATABASE || databaseContainer.environment.MARIADB_DATABASE
      const user = configuredUser || databaseContainer.environment.MYSQL_USER || databaseContainer.environment.MARIADB_USER
      if (!database || !user) throw new Error('Flarum database name or user is unavailable in local configuration and container environment')
      const password = configuredPassword || databaseContainer.environment.MYSQL_PASSWORD || databaseContainer.environment.MARIADB_PASSWORD
      let dumpCommand = process.env.UPDATE_FLARUM_DUMP_COMMAND?.trim()
      if (!dumpCommand) {
        const detected = spawnSync(docker, ['exec', container, 'sh', '-lc', 'command -v mariadb-dump >/dev/null 2>&1 && echo mariadb-dump || (command -v mysqldump >/dev/null 2>&1 && echo mysqldump)'], { encoding: 'utf8', windowsHide: true, timeout: 10_000 })
        dumpCommand = detected.status === 0 ? detected.stdout.trim() : ''
      }
      if (!dumpCommand) throw new Error(`no mariadb-dump or mysqldump executable found in ${container}`)
      const args = ['exec']
      if (password) args.push('-e', `MYSQL_PWD=${password}`)
      args.push(container, dumpCommand, '--single-transaction', '--quick', '--host', host === '127.0.0.1' ? '127.0.0.1' : host, '--port', port, '--user', user, database)
      await runCaptureToFile(docker, args, output, 30 * 60_000, payload.repoRoot, undefined, '正在流式备份 Flarum 数据库（Docker）')
      return { name: 'flarumDatabase', status: 'completed', path: 'flarum.sql', method: `docker exec ${dumpCommand} (streamed)` }
    } catch (error) {
      failures.push(`Docker database dump: ${error instanceof Error ? error.message : String(error)}`)
      await fs.rm(output, { force: true })
    }
  }

  const unavailable = 'mariadb-dump/mysqldump is unavailable and no running Flarum database container could be detected'
  return { name: 'flarumDatabase', status: 'failed', path: 'flarum.sql', error: failures.length > 0 ? failures.join('; ') : unavailable }
}

async function backupDirectory(name: string, source: string, directory: string, required = true): Promise<BackupManifestItem> {
  const target = path.join(directory, `${name}.tar`)
  try {
    await fs.access(source)
    if (!commandAvailable('tar')) throw new Error('tar is unavailable')
    await runCaptureToFile('tar', ['-C', source, '-cf', '-', '.'], target, 30 * 60_000, payload.repoRoot, undefined, `正在限速备份 ${name}`)
    return { name, status: 'completed', path: `${name}.tar`, method: 'rate-limited tar stream' }
  } catch (error: any) {
    await fs.rm(target, { force: true }).catch(() => undefined)
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
    const flarumEnvPath = path.join(payload.repoRoot, '.env.flarum')
    const composeFlarum = commandAvailable(docker)
      ? readDockerComposeService(docker, payload.repoRoot, path.join(payload.repoRoot, 'docker-compose.flarum.yml'), flarumEnvPath, 'flarum')
      : null
    const container = commandAvailable(docker) ? discoverDockerContainer({
      docker,
      repoRoot: payload.repoRoot,
      kind: 'flarumApp',
      explicitName: process.env.UPDATE_FLARUM_CONTAINER || composeFlarum?.containerName,
    })?.name : undefined
    const target = path.join(dataBackupDir, 'flarum-data.tar')
    if (container && commandAvailable(docker)) {
      try {
        await runCaptureToFile(
          docker,
          ['exec', container, 'tar', '-C', '/data', '-cf', '-', 'assets', 'extensions'],
          target,
          30 * 60_000,
          payload.repoRoot,
          undefined,
          '正在限速备份 Flarum 上传资源与扩展清单'
        )
        items.push({ name: 'flarumData', status: 'completed', path: 'flarum-data.tar', method: 'rate-limited Docker tar stream' })
      } catch (error) {
        await fs.rm(target, { force: true }).catch(() => undefined)
        items.push({ name: 'flarumData', status: 'failed', path: 'flarum-data.tar', error: error instanceof Error ? error.message : String(error) })
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
    appendLog(`Forum bridge update failed: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
}

async function runDatabaseMigrations(): Promise<void> {
  await run('node', [path.join('dist', 'scripts', 'runMigration.js'), 'run'], 'running_migrations', 'Running pending database migrations', 15 * 60_000, path.join(payload.repoRoot, 'backend'))
}

async function downloadArtifact(url?: string): Promise<string> {
  if (payload.artifactFile) {
    const artifactFile = path.resolve(payload.artifactFile)
    await fs.access(artifactFile)
    return artifactFile
  }
  if (!url) throw new Error('deployment package URL is not configured')
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
  if (!response.body) throw new Error('deployment package download returned an empty response body')
  const archivePath = path.join(os.tmpdir(), `carradioweb-${payload.jobId}.tar.gz`)
  try {
    await pipeline(
      Readable.fromWeb(response.body as unknown as import('stream/web').ReadableStream),
      createWriteStream(archivePath, { flags: 'wx' })
    )
  } catch (error) {
    await fs.rm(archivePath, { force: true })
    throw error
  }
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

async function fileFingerprint(file: string): Promise<string> {
  try {
    return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')
  } catch {
    return ''
  }
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
  if (!payload.artifactUrl && !payload.artifactFile) throw new Error('deployment package source is not configured')
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
    if (relative === 'docker-compose.flarum.yml' || relative === path.join('scripts', 'install-forum-bridge.sh')) {
      forumBridgeChanged = forumBridgeChanged ||
        (await fileFingerprint(path.join(payload.repoRoot, relative))) !== (await fileFingerprint(path.join(stagingDir, relative)))
    }
    if (stableDirectoryPaths.has(relative)) {
      if (relative === 'forum-extensions') {
        forumBridgeChanged = forumBridgeChanged ||
          (await directoryFingerprint(path.join(payload.repoRoot, relative))) !==
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
    if (payload.artifactUrl || payload.artifactFile) {
      await writeStatus({ stage: 'downloading', message: 'Downloading the prebuilt package from GitHub' })
      await applyArtifact()
      if (forumBridgeChanged) {
        await installForumBridge()
      } else {
        await writeStatus({ stage: 'forum_unchanged', message: 'Forum files unchanged; preserving the current forum installation' })
      }
      await runDatabaseMigrations()
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
    await runDatabaseMigrations()
    const forumDiff = spawnSync('git', [
      'diff', '--quiet', payload.previousCommit, payload.targetCommit, '--',
      'forum-extensions', 'docker-compose.flarum.yml', 'scripts/install-forum-bridge.sh',
    ], { cwd: payload.repoRoot, windowsHide: true })
    if (forumDiff.error || forumDiff.status === null || forumDiff.status > 1) {
      throw forumDiff.error || new Error('Unable to determine whether forum files changed')
    }
    if (forumDiff.status === 1) await installForumBridge()
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
