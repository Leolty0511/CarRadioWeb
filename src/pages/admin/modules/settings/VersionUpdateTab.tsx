import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Loader2,
  Server,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import {
  applyProjectUpdate,
  checkProjectUpdate,
  getProjectUpdateInfo,
  getProjectUpdateStatus,
  type ProjectUpdateInfo,
  type ProjectUpdateLogEntry,
  type UpdateJobStatus,
} from '@/services/projectUpdateService'

const BLOCKER_TEXT: Record<string, string> = {
  not_git_repository: '当前安装目录不是 Git 仓库，无法自动拉取代码。',
  unexpected_git_remote: '当前 Git 远端不是指定的官方仓库，已阻止自动更新。',
  working_tree_dirty: '服务器存在未提交的本地改动，请先处理后再更新。',
  self_update_disabled: '本地开发环境不执行自我更新；部署到生产服务器后可用。',
  pm2_required: '自动重启需要使用 PM2 托管后端进程。',
  local_branch_diverged: '服务器分支包含未推送提交，不能自动快进更新。',
  remote_unavailable: '暂时无法连接 GitHub 获取更新信息，请检查服务器网络或仓库授权。',
  already_up_to_date: '当前已经是最新版本。',
}

function formatDate(value: string | null): string {
  if (!value) {return '尚未检查'}
  return new Date(value).toLocaleString('zh-CN')
}

function formatLogDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {return ''}
  return date.toLocaleDateString('zh-CN')
}

function VersionValue({ value, detail }: { value: string; detail?: string | null }) {
  return (
    <div className="min-w-0">
      <div className="font-semibold text-slate-900 dark:text-white break-words">{value}</div>
      {detail && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 break-words">{detail}</div>}
    </div>
  )
}

export function VersionUpdateTab() {
  const { showToast } = useToast()
  const [info, setInfo] = useState<ProjectUpdateInfo | null>(null)
  const [status, setStatus] = useState<UpdateJobStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [starting, setStarting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [selectedLog, setSelectedLog] = useState<ProjectUpdateLogEntry | null>(null)
  const [showReleaseNotes, setShowReleaseNotes] = useState(false)

  const load = useCallback(async (silent = false) => {
    try {
      const [nextInfo, nextStatus] = await Promise.all([
        getProjectUpdateInfo(),
        getProjectUpdateStatus(),
      ])
      setInfo(nextInfo)
      setStatus(nextStatus)
    } catch (error) {
      if (!silent) {
        showToast({
          type: 'error',
          title: '版本信息加载失败',
          description: error instanceof Error ? error.message : '',
        })
      }
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    void load()
  }, [load])

  const jobActive = status?.state === 'running' || status?.state === 'restarting'
  useEffect(() => {
    if (!jobActive) {return}
    let refreshTimer: number | undefined
    const timer = window.setInterval(async () => {
      try {
        const next = await getProjectUpdateStatus()
        setStatus(next)
        if (next.state === 'completed') {
          showToast({ type: 'success', title: '项目更新完成', description: '前后端服务已重启，正在刷新版本信息。' })
          refreshTimer = window.setTimeout(() => { void load(true) }, 3000)
          window.clearInterval(timer)
        } else if (next.state === 'failed') {
          showToast({ type: 'error', title: '项目更新失败', description: next.message })
          window.clearInterval(timer)
        }
      } catch {
        // A short connection loss is expected while PM2 restarts the backend.
      }
    }, 2500)
    return () => {
      window.clearInterval(timer)
      if (refreshTimer) {window.clearTimeout(refreshTimer)}
    }
  }, [jobActive, load, showToast])

  const handleCheck = async () => {
    setChecking(true)
    try {
      const next = await checkProjectUpdate()
      setInfo(next)
      const blockerText = next.blocker ? BLOCKER_TEXT[next.blocker] || next.blocker : null
      showToast({
        type: next.updateAvailable ? 'info' : next.blocker === 'already_up_to_date' ? 'success' : 'warning',
        title: next.updateAvailable
          ? `发现 ${next.commitsBehind} 个新提交`
          : next.blocker === 'already_up_to_date'
            ? '当前已经是最新版本'
            : '当前无法检查远程版本',
        description: next.blocker === 'already_up_to_date' ? undefined : blockerText || undefined,
      })
    } catch (error) {
      showToast({ type: 'error', title: '检查更新失败', description: error instanceof Error ? error.message : '' })
    } finally {
      setChecking(false)
    }
  }

  const handleApply = async () => {
    setStarting(true)
    try {
      const next = await applyProjectUpdate()
      setStatus(next)
      showToast({ type: 'info', title: '更新已开始', description: '页面会持续显示前端、后端安装与重启进度。' })
    } catch (error) {
      showToast({ type: 'error', title: '无法开始更新', description: error instanceof Error ? error.message : '' })
    } finally {
      setStarting(false)
    }
  }

  const statusBadge = useMemo(() => {
    if (!info) {return null}
    if (info.updateAvailable) {return <Badge variant="warning" size="sm">有可用更新</Badge>}
    if (info.remoteCommit) {return <Badge variant="success" size="sm">已是最新</Badge>}
    return <Badge variant="secondary" size="sm">等待检查</Badge>
  }, [info])

  if (loading) {
    return (
      <div className="flex min-h-56 items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 加载版本信息
      </div>
    )
  }

  if (!info) {return null}

  const blockerText = info.blocker ? BLOCKER_TEXT[info.blocker] || info.blocker : null
  const currentLabel = info.currentVersion === 'unknown' ? '未知版本' : `v${info.currentVersion}`
  const remoteLabel = info.remoteVersion ? `v${info.remoteVersion}` : '尚未获取'
  const updateLog = info.updateLog ?? []

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="flex min-w-0 items-center gap-2 text-lg">
            <GitBranch className="h-5 w-5 flex-shrink-0" />
            <span>项目版本</span>
            {statusBadge}
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCheck}
            disabled={checking || jobActive}
            className="h-9 min-w-28 rounded-md border border-cyan-500/60 bg-white px-5 text-sm font-semibold tracking-normal text-slate-800 shadow-[inset_0_0_0_1px_rgba(6,182,212,0.08),0_0_16px_rgba(6,182,212,0.12)] hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-800 hover:shadow-[inset_0_0_0_1px_rgba(6,182,212,0.15),0_0_20px_rgba(6,182,212,0.2)] dark:bg-slate-950 dark:text-cyan-200 dark:hover:bg-slate-900 dark:hover:text-cyan-100 disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-100 disabled:shadow-none dark:disabled:border-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-400"
          >
            {checking ? '检查中...' : '检查更新'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700 md:grid-cols-2">
            <div className="bg-white p-4 dark:bg-slate-900">
              <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">当前版本</div>
              <VersionValue value={currentLabel} detail={info.currentCommitShort ? `${info.currentCommitShort} · ${info.currentCommitMessage || ''}` : null} />
            </div>
            <div className="bg-white p-4 dark:bg-slate-900">
              <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">GitHub 最新版本</div>
              <VersionValue value={remoteLabel} detail={info.remoteCommitShort ? `${info.remoteCommitShort} · ${info.remoteCommitMessage || ''}` : null} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">代码分支</div>
              <div className="mt-1 font-medium text-slate-800 dark:text-slate-200">{info.branch}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">落后提交</div>
              <div className="mt-1 font-medium text-slate-800 dark:text-slate-200">{info.commitsBehind}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">最近检查</div>
              <div className="mt-1 font-medium text-slate-800 dark:text-slate-200">{formatDate(info.checkedAt)}</div>
            </div>
          </div>

          {blockerText && (
            <div className={`flex items-start gap-3 rounded-md border p-3 text-sm ${
              info.blocker === 'already_up_to_date'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
                : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300'
            }`}>
              {info.blocker === 'already_up_to_date'
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                : <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />}
              <span>{blockerText}</span>
            </div>
          )}

          {info.updateAvailable && updateLog.length > 0 && (
            <section className="border-t border-slate-200 pt-4 dark:border-slate-700" aria-labelledby="update-log-title">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 id="update-log-title" className="text-sm font-semibold text-slate-900 dark:text-white">更新日志</h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {info.commitsBehind > updateLog.length
                    ? `显示最近 ${updateLog.length} 条，共 ${info.commitsBehind} 条`
                    : `共 ${info.commitsBehind} 条`}
                </span>
              </div>
              <ol className="max-h-72 divide-y divide-slate-100 overflow-y-auto border-y border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                {updateLog.map(entry => (
                  <li key={entry.commit}>
                    <button
                      type="button"
                      onClick={() => setSelectedLog(entry)}
                      className="grid w-full gap-1 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:hover:bg-slate-800/60 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4"
                      aria-label={`查看提交 ${entry.shortCommit} 的完整更新内容`}
                    >
                      <div className="min-w-0 px-2 sm:px-3">
                        <p className="break-words text-sm font-medium text-slate-800 dark:text-slate-200">
                          {entry.message.split(/\r?\n/, 1)[0]}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{entry.shortCommit} · {entry.author}</p>
                      </div>
                      <time className="px-2 text-xs text-slate-400 sm:px-3" dateTime={entry.committedAt}>{formatLogDate(entry.committedAt)}</time>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {info.updateAvailable && info.releaseNotes && (
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">版本更新说明</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">查看本次版本的完整中文更新内容</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowReleaseNotes(true)}>查看完整说明</Button>
            </div>
          )}

          {status && status.state !== 'idle' && (
            <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
              <div className="flex items-center gap-2">
                {jobActive ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> : <Server className="h-4 w-4 text-slate-500" />}
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{status.message}</span>
              </div>
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">阶段：{status.stage}</div>
            </div>
          )}

          <div className="flex justify-end border-t border-slate-200 pt-4 dark:border-slate-700">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmOpen(true)}
              disabled={!info.canUpdate || jobActive || starting}
              className="h-9 min-w-36 rounded-md border border-cyan-400 bg-slate-950 px-5 text-sm font-semibold tracking-normal text-cyan-100 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.14),0_0_18px_rgba(6,182,212,0.2)] hover:border-cyan-300 hover:bg-slate-900 hover:text-white hover:shadow-[inset_0_0_0_1px_rgba(103,232,249,0.22),0_0_24px_rgba(6,182,212,0.3)] disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500 disabled:opacity-100 disabled:shadow-none dark:disabled:border-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-400"
            >
              {starting ? '正在启动...' : '拉取更新并重启'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Modal
        isOpen={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title="完整更新内容"
        size="lg"
      >
        {selectedLog && (
          <article className="space-y-4">
            <div>
              <h3 className="break-words text-lg font-semibold text-slate-900 dark:text-white">
                {selectedLog.message.split(/\r?\n/, 1)[0]}
              </h3>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>提交：{selectedLog.shortCommit}</span>
                <span>作者：{selectedLog.author}</span>
                <time dateTime={selectedLog.committedAt}>时间：{formatDate(selectedLog.committedAt)}</time>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/50">
              <div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700 dark:text-slate-200">
                {selectedLog.message}
              </div>
            </div>
          </article>
        )}
      </Modal>

      <Modal
        isOpen={showReleaseNotes}
        onClose={() => setShowReleaseNotes(false)}
        title={`v${info.remoteVersion || '最新版本'} 更新说明`}
        size="lg"
      >
        <div className="whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-slate-700 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-200">
          {info.releaseNotes}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void handleApply()}
        title="确认更新项目"
        message={`将拉取 ${info.commitsBehind} 个新提交，安装依赖并构建项目，然后重启前端和后端服务。更新期间网站会短暂不可访问，是否继续？`}
        confirmText="开始更新"
        cancelText="取消"
        type="warning"
      />
    </>
  )
}
