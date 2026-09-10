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

type SpawnSyncLike = typeof spawnSync

interface DiscoverOptions {
  docker: string
  repoRoot: string
  kind: BackupContainerKind
  explicitName?: string
  defaultNames: string[]
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
  const name = container.name.toLowerCase()
  if (kind === 'mongo' && name.includes('mongo')) return 60
  if (kind === 'flarumDatabase' && (name.includes('flarum') || name.includes('mariadb'))) return 60
  if (kind === 'flarumApp' && name.includes('flarum')) return 60
  return 10
}

export function discoverDockerContainer(options: DiscoverOptions): DockerContainerInfo | null {
  const spawn = options.spawn || spawnSync
  const directCandidates = [options.explicitName, ...options.defaultNames]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(value => value.trim())
    .filter((value, index, values) => values.indexOf(value) === index)

  for (const [index, candidate] of directCandidates.entries()) {
    const inspected = inspectDockerContainer(options.docker, candidate, spawn)
    if (!inspected?.running) continue
    if (index === 0 && options.explicitName?.trim() === candidate) return inspected
    if (matchesKind(inspected, options.kind)) return inspected
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
    .filter(candidate => candidate.score >= 60)
    .sort((left, right) => right.score - left.score)

  return scored[0]?.container || null
}
