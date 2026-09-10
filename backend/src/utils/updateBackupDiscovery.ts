import { spawnSync } from 'child_process'
import path from 'path'

export type BackupContainerKind = 'mongo' | 'flarumDatabase' | 'flarumApp'

export interface DockerContainerInfo {
  id: string
  name: string
  image: string
  running: boolean
  labels: Record<string, string>
  environment: Record<string, string>
}

export interface DockerComposeServiceInfo {
  containerName?: string
  environment: Record<string, string>
}

type SpawnSyncLike = typeof spawnSync

interface DiscoverOptions {
  docker: string
  repoRoot: string
  kind: BackupContainerKind
  explicitName?: string
  spawn?: SpawnSyncLike
}

const MAX_DISCOVERY_CONTAINERS = 100
const SAFE_CONTAINER_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/

export function mongoDatabaseFromUri(uri?: string): string | undefined {
  if (!uri) return undefined
  try {
    const pathname = new URL(uri).pathname.replace(/^\//, '')
    if (!pathname) return undefined
    const database = decodeURIComponent(pathname.split('/')[0]).trim()
    return database || undefined
  } catch {
    return undefined
  }
}

function normalizePath(value: string): string {
  const normalized = path.resolve(value).replace(/\\/g, '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function parseEnvironment(values: unknown): Record<string, string> {
  if (values && typeof values === 'object' && !Array.isArray(values)) {
    return Object.fromEntries(Object.entries(values as Record<string, unknown>)
      .filter((entry): entry is [string, string | number | boolean] => ['string', 'number', 'boolean'].includes(typeof entry[1]))
      .map(([key, value]) => [key, String(value)]))
  }
  if (!Array.isArray(values)) return {}
  const environment: Record<string, string> = {}
  for (const entry of values) {
    if (typeof entry !== 'string') continue
    const separator = entry.indexOf('=')
    if (separator <= 0) continue
    environment[entry.slice(0, separator)] = entry.slice(separator + 1)
  }
  return environment
}

export function readDockerComposeService(
  docker: string,
  repoRoot: string,
  composeFile: string,
  envFile: string | undefined,
  service: string,
  spawn: SpawnSyncLike = spawnSync
): DockerComposeServiceInfo | null {
  const args = ['compose', '--file', composeFile]
  if (envFile) args.push('--env-file', envFile)
  args.push('config', '--format', 'json')
  const result = spawn(docker, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 2 * 1024 * 1024,
  })
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string') return null
  try {
    const document = JSON.parse(result.stdout) as Record<string, any>
    const serviceConfig = document.services?.[service]
    if (!serviceConfig || typeof serviceConfig !== 'object') return null
    return {
      containerName: typeof serviceConfig.container_name === 'string' ? serviceConfig.container_name : undefined,
      environment: parseEnvironment(serviceConfig.environment),
    }
  } catch {
    return null
  }
}

export function inspectDockerContainer(
  docker: string,
  container: string,
  spawn: SpawnSyncLike = spawnSync
): DockerContainerInfo | null {
  if (!SAFE_CONTAINER_NAME.test(container)) return null
  const result = spawn(docker, ['inspect', '--type', 'container', container], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 2 * 1024 * 1024,
  })
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string') return null
  try {
    const documents = JSON.parse(result.stdout) as Array<Record<string, any>>
    const document = documents[0]
    if (!document) return null
    return {
      id: typeof document.Id === 'string' ? document.Id : '',
      name: typeof document.Name === 'string' ? document.Name.replace(/^\//, '') : container,
      image: typeof document.Config?.Image === 'string' ? document.Config.Image : '',
      running: document.State?.Running === true,
      labels: document.Config?.Labels && typeof document.Config.Labels === 'object' ? document.Config.Labels : {},
      environment: parseEnvironment(document.Config?.Env),
    }
  } catch {
    return null
  }
}

function matchesKind(container: DockerContainerInfo, kind: BackupContainerKind): boolean {
  const image = container.image.toLowerCase()
  const service = container.labels['com.docker.compose.service']?.toLowerCase() || ''
  const environment = container.environment
  if (kind === 'mongo') {
    return service === 'mongo' || image === 'mongo' || image.startsWith('mongo:') || Boolean(environment.MONGO_INITDB_DATABASE)
  }
  if (kind === 'flarumApp') {
    return service === 'flarum' || image.includes('flarum') || Boolean(environment.FLARUM_BASE_URL)
  }
  return service === 'db' || image.includes('mariadb') || image.includes('mysql') || environment.MYSQL_DATABASE === 'flarum'
}

function scoreContainer(container: DockerContainerInfo, kind: BackupContainerKind, repoRoot: string): number {
  if (!container.running || !matchesKind(container, kind)) return -1
  const workingDirectory = container.labels['com.docker.compose.project.working_dir']
  const sameProject = Boolean(workingDirectory) && normalizePath(workingDirectory) === normalizePath(repoRoot)
  const service = container.labels['com.docker.compose.service']?.toLowerCase() || ''
  const expectedService = kind === 'mongo' ? 'mongo' : kind === 'flarumApp' ? 'flarum' : 'db'
  if (sameProject && service === expectedService) return 100
  if (sameProject) return 80
  return -1
}

export function discoverDockerContainer(options: DiscoverOptions): DockerContainerInfo | null {
  const spawn = options.spawn || spawnSync
  const explicitName = options.explicitName?.trim()
  if (explicitName) {
    const candidate = explicitName
    const inspected = inspectDockerContainer(options.docker, candidate, spawn)
    if (inspected?.running && matchesKind(inspected, options.kind)) return inspected
  }

  const listed = spawn(options.docker, ['ps', '--filter', 'status=running', '--format', '{{.ID}}'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 512 * 1024,
  })
  if (listed.error || listed.status !== 0 || typeof listed.stdout !== 'string') return null

  const scored = listed.stdout.split(/\r?\n/)
    .map(value => value.trim())
    .filter(Boolean)
    .slice(0, MAX_DISCOVERY_CONTAINERS)
    .map(id => inspectDockerContainer(options.docker, id, spawn))
    .filter((value): value is DockerContainerInfo => Boolean(value))
    .map(container => ({ container, score: scoreContainer(container, options.kind, options.repoRoot) }))
    .filter(candidate => candidate.score >= 80)
    .sort((left, right) => right.score - left.score)

  if (scored.length > 1 && scored[0].score === scored[1].score) return null
  return scored[0]?.container || null
}
