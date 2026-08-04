import { spawnSync } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'

interface RunnerPayload {
  jobId: string
  repoRoot: string
  branch: string
  previousCommit: string
  targetCommit: string
  statusFile: string
  pm2Target: string
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
let merged = false
let logs: string[] = []
const startedAt = new Date().toISOString()

function appendLog(message: string): void {
  const clean = message.trim().replace(/\u001b\[[0-9;]*m/g, '')
  if (!clean) return
  logs = [...logs, clean.slice(-2000)].slice(-40)
}

async function writeStatus(patch: Partial<RunnerStatus>): Promise<void> {
  const now = new Date().toISOString()
  const status: RunnerStatus = {
    jobId: payload.jobId,
    state: 'running',
    stage: 'starting',
    message: '正在准备更新',
    startedAt,
    completedAt: null,
    fromCommit: payload.previousCommit,
    toCommit: payload.targetCommit,
    ...patch,
    updatedAt: now,
    logs,
  }
  const tempFile = `${payload.statusFile}.${process.pid}.tmp`
  await fs.mkdir(path.dirname(payload.statusFile), { recursive: true })
  await fs.writeFile(tempFile, JSON.stringify(status, null, 2), 'utf8')
  await fs.rename(tempFile, payload.statusFile)
}

function run(
  command: string,
  args: string[],
  stage: string,
  message: string,
  timeout = 15 * 60_000,
  cwd = payload.repoRoot
): void {
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
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} 执行失败（退出码 ${result.status}）`)
}

async function rollback(reason: unknown): Promise<void> {
  const detail = reason instanceof Error ? reason.message : String(reason)
  appendLog(`更新失败：${detail}`)
  if (!merged) {
    await writeStatus({
      state: 'failed',
      stage: 'failed',
      message: detail,
      completedAt: new Date().toISOString(),
    })
    return
  }

  try {
    run('git', ['reset', '--hard', payload.previousCommit], 'rollback', '更新失败，正在回退代码')
    run(npmCommand, ['ci', '--include=dev', '--no-audit', '--no-fund'], 'rollback_dependencies', '正在恢复前端依赖')
    run(
      npmCommand,
      ['ci', '--include=dev', '--no-audit', '--no-fund'],
      'rollback_backend_dependencies',
      '正在恢复后端依赖',
      15 * 60_000,
      path.join(payload.repoRoot, 'backend')
    )
    run(npmCommand, ['run', 'build'], 'rollback_build', '正在恢复原版本构建', 20 * 60_000)
  } catch (rollbackError) {
    appendLog(`自动回退未完成：${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`)
  }

  await writeStatus({
    state: 'failed',
    stage: 'rolled_back',
    message: `更新失败，已尝试回退：${detail}`,
    completedAt: new Date().toISOString(),
  })
}

async function main(): Promise<void> {
  try {
    await writeStatus({ stage: 'fetching', message: '正在从 GitHub 获取最新代码' })
    run('git', ['fetch', '--quiet', 'origin', payload.branch], 'fetching', '正在从 GitHub 获取最新代码', 2 * 60_000)

    const fetched = spawnSync('git', ['rev-parse', `origin/${payload.branch}`], {
      cwd: payload.repoRoot,
      encoding: 'utf8',
      windowsHide: true,
    })
    if (fetched.status !== 0 || fetched.stdout.trim() !== payload.targetCommit) {
      throw new Error('远端版本在确认后发生变化，请重新检查更新')
    }

    run('git', ['merge', '--ff-only', payload.targetCommit], 'updating_code', '正在更新项目代码')
    merged = true
    run(npmCommand, ['ci', '--include=dev', '--no-audit', '--no-fund'], 'installing_frontend', '正在安装前端依赖')
    run(
      npmCommand,
      ['ci', '--include=dev', '--no-audit', '--no-fund'],
      'installing_backend',
      '正在安装后端依赖',
      15 * 60_000,
      path.join(payload.repoRoot, 'backend')
    )
    run(npmCommand, ['run', 'build'], 'building', '正在构建新版本', 20 * 60_000)

    await writeStatus({ state: 'restarting', stage: 'restarting', message: '更新完成，正在重启服务器' })
    run(pm2Command, ['restart', payload.pm2Target, '--update-env'], 'restarting', '正在重启服务器', 2 * 60_000)
    await writeStatus({
      state: 'completed',
      stage: 'completed',
      message: '更新完成，服务器已重启',
      completedAt: new Date().toISOString(),
    })
  } catch (error) {
    await rollback(error)
    process.exitCode = 1
  }
}

void main()
