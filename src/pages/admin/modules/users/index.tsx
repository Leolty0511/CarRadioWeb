import { useCallback, useEffect, useState } from 'react'
import { Ban, Check, Crown, Edit2, ShieldCheck, Trash2, UserCheck, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import {
  createUser,
  deleteUser,
  getPermissions,
  getUsers,
  transferSuperAdmin,
  updateOwnAccount,
  updateOwnNickname,
  updateUser,
  type AdminUserRecord,
  type CreateUserPayload,
} from '@/services/userService'
import type { AdminUser } from '@/services/authService'
import { UserAvatar } from '@/components/ui/UserAvatar'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const LOGIN_PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  email: '邮箱密码',
}

const PERMISSION_GROUP_LABELS: Record<string, string> = {
  pages: '页面可见性',
  documents: '文档',
  products: '产品',
  categories: '分类',
  vehicles: '车型',
  banners: 'Banner',
  announcements: '公告',
  software: '软件',
  resources: '资源',
  feedback: '反馈',
  contacts: '联系方式',
  canbus: 'CANBus',
  settings: '设置',
  notifications: '消息渠道',
  system: '系统',
  ai: 'AI',
  seo: 'SEO',
  content: '内容',
  visitors: '访客',
}

const PERMISSION_ACTION_LABELS: Record<string, string> = {
  create: '创建',
  read: '查看',
  update: '编辑',
  delete: '删除',
  publish: '发布',
  configure: '配置',
}

const PAGE_LABELS: Record<string, string> = {
  dashboard: '仪表盘',
  documents: '文档',
  products: '产品',
  categories: '分类',
  vehicles: '车型',
  banners: 'Banner',
  announcements: '公告',
  feedback: '反馈',
  'ai-config': 'AI 配置',
  software: '软件',
  resources: '资源',
  visitors: '访客',
  settings: '设置',
  seo: 'SEO',
  content: '内容',
  'canbus-settings': 'CANBus',
  downloads: '下载',
  'user-manual': '用户手册',
  'news-management': '新闻管理',
  contact: '联系方式',
  forms: '表单',
  'module-settings': '功能设置',
  'oss-storage': '存储服务',
  notification: '消息推送',
  'compliance-hub': '合规与线索',
  'system-monitor': '系统监控',
}

function groupPermissions(perms: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {}
  for (const p of perms) {
    const [group] = p.split(':')
    if (!groups[group]) { groups[group] = [] }
    groups[group].push(p)
  }
  return groups
}

function formatPermission(perm: string): string {
  const parts = perm.split(':')
  if (parts.length < 2) { return perm }
  const [group, action] = parts
  if (group === 'pages') {
    return PAGE_LABELS[action] ?? action
  }
  return PERMISSION_ACTION_LABELS[action] ?? action
}

type UserFormPayload = CreateUserPayload & {
  currentPassword?: string
  newPassword?: string
}

interface UserDialogProps {
  user: AdminUserRecord | null
  allPermissions: string[]
  forceAccountSetup?: boolean
  onSave: (data: UserFormPayload) => Promise<void>
  onClose: () => void
}

function UserDialog({ user, allPermissions, forceAccountSetup = false, onSave, onClose }: UserDialogProps) {
  const [email, setEmail] = useState(user?.email ?? '')
  const [nickname, setNickname] = useState(user?.nickname ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set(user?.permissions ?? []))
  const [saving, setSaving] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const grouped = groupPermissions(allPermissions)
  const isSuperAdmin = user?.role === 'super_admin'
  const isNewInvite = !user

  const togglePerm = (p: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(p) ? next.delete(p) : next.add(p)
      return next
    })
  }

  const toggleGroup = (perms: string[]) => {
    const allSelected = perms.every(p => selected.has(p))
    setSelected(prev => {
      const next = new Set(prev)
      perms.forEach(p => allSelected ? next.delete(p) : next.add(p))
      return next
    })
  }

  const handleSubmit = async () => {
    setLocalError(null)
    const cleanNickname = nickname.trim()
    const cleanEmail = email.trim().toLowerCase()

    if (!cleanNickname) {
      setLocalError('请填写昵称')
      return
    }
    if (isNewInvite && (!cleanEmail || !EMAIL_RE.test(cleanEmail))) {
      setLocalError('请填写有效的邀请邮箱')
      return
    }
    if (isSuperAdmin && (!cleanEmail || !EMAIL_RE.test(cleanEmail))) {
      setLocalError('请填写有效的邮箱地址')
      return
    }
    if (isSuperAdmin && (forceAccountSetup || newPassword) && newPassword.length < 10) {
      setLocalError('新密码至少 10 位')
      return
    }
    if (isSuperAdmin && newPassword !== confirmPassword) {
      setLocalError('两次输入的新密码不一致')
      return
    }
    const changesCredentials = isSuperAdmin && (
      forceAccountSetup || cleanEmail !== (user?.email ?? '') || newPassword.length > 0
    )
    if (changesCredentials && !currentPassword) {
      setLocalError('请输入当前密码确认修改')
      return
    }

    setSaving(true)
    try {
      await onSave({
        email: isNewInvite || isSuperAdmin ? cleanEmail : undefined,
        nickname: cleanNickname,
        permissions: [...selected],
        currentPassword: isSuperAdmin ? currentPassword : undefined,
        newPassword: isSuperAdmin ? newPassword : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {isSuperAdmin ? '编辑个人信息' : user ? '编辑管理员' : '邀请管理员'}
          </h3>
          {!forceAccountSetup && (
            <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="关闭">
              <X className="h-5 w-5 text-slate-400" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {localError && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2" role="alert">
              {localError}
            </p>
          )}

          {forceAccountSetup && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              默认账号仅用于首次登录。请设置邮箱和新密码后再继续使用后台。
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {isSuperAdmin ? (
              <>
                <div>
                  <label className="block text-sm text-slate-600 dark:text-slate-300 mb-1">登录账号</label>
                  <Input
                    type="text"
                    value={user?.loginUsername ?? ''}
                    disabled
                    className="bg-slate-100 dark:bg-slate-900/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 dark:text-slate-300 mb-1">邮箱</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                    autoComplete="email"
                  />
                </div>
              </>
            ) : (
              <div>
              <label className="block text-sm text-slate-600 dark:text-slate-300 mb-1">
                {isNewInvite ? '邀请邮箱' : user?.loginUsername ? '登录账号' : '邮箱'}
              </label>
              <Input
                type={isNewInvite ? 'email' : 'text'}
                value={isNewInvite ? email : user?.loginUsername ?? user?.email ?? ''}
                onChange={e => setEmail(e.target.value)}
                disabled={!isNewInvite}
                placeholder="admin@example.com"
                className={!isNewInvite ? 'bg-slate-100 dark:bg-slate-900/50' : undefined}
              />
              </div>
            )}
            <div>
              <label className="block text-sm text-slate-600 dark:text-slate-300 mb-1">昵称</label>
              <Input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="管理员昵称" />
            </div>
          </div>

          {isSuperAdmin && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-200 pt-4 dark:border-slate-700">
              <div>
                <label className="block text-sm text-slate-600 dark:text-slate-300 mb-1">当前密码</label>
                <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} autoComplete="current-password" />
              </div>
              <div>
                <label className="block text-sm text-slate-600 dark:text-slate-300 mb-1">新密码</label>
                <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" placeholder="至少 10 位" />
              </div>
              <div>
                <label className="block text-sm text-slate-600 dark:text-slate-300 mb-1">确认新密码</label>
                <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" />
              </div>
            </div>
          )}

          {isNewInvite && (
            <div className="text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/40 rounded-lg border border-slate-200 dark:border-slate-600 p-3">
              系统会向该邮箱发送一次性邀请链接，被邀请人通过链接自行设置密码。邀请有效期为 48 小时。
            </div>
          )}

          {!isSuperAdmin && (
            <div>
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-3">权限分配</h4>
              <div className="space-y-3">
                {Object.entries(grouped).map(([group, perms]) => {
                  const allChecked = perms.every(p => selected.has(p))
                  return (
                    <div key={group} className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                      <label className="flex items-center gap-2 cursor-pointer mb-2">
                        <input type="checkbox" checked={allChecked} onChange={() => toggleGroup(perms)} className="w-4 h-4 accent-blue-600 rounded" />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                          {PERMISSION_GROUP_LABELS[group] ?? group}
                        </span>
                      </label>
                      <div className="flex flex-wrap gap-2 ml-6">
                        {perms.map(p => (
                          <label key={p} className="flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={selected.has(p)} onChange={() => togglePerm(p)} className="w-3.5 h-3.5 accent-blue-600 rounded" />
                            <span className="text-xs text-slate-500 dark:text-slate-400">{formatPermission(p)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-slate-200 dark:border-slate-700">
          {!forceAccountSetup && <Button variant="outline" onClick={onClose}>取消</Button>}
          <Button onClick={handleSubmit} disabled={saving || !nickname.trim() || (isNewInvite && !email.trim())}>
            {saving ? '保存中...' : isNewInvite ? '发送邀请' : forceAccountSetup ? '完成账号设置' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  )
}

interface UserManagementProps {
  currentUser: AdminUser | null
  forceAccountSetup?: boolean
  onAccountUpdated?: () => Promise<void>
}

export function UserManagement({ currentUser, forceAccountSetup = false, onAccountUpdated }: UserManagementProps) {
  const { showToast } = useToast()
  const [users, setUsers] = useState<AdminUserRecord[]>([])
  const [allPermissions, setAllPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogUser, setDialogUser] = useState<AdminUserRecord | null | 'new'>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; user: AdminUserRecord | null }>({ open: false, user: null })
  const [transferTarget, setTransferTarget] = useState<AdminUserRecord | null>(null)
  const [transferPassword, setTransferPassword] = useState('')
  const [transferring, setTransferring] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [u, p] = await Promise.all([getUsers(), getPermissions()])
      setUsers(u)
      setAllPermissions(p)
    } catch {
      showToast({ type: 'error', title: '加载失败' })
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!forceAccountSetup || !currentUser || dialogUser !== null) {return}
    const ownRecord = users.find(user => user._id === currentUser.id)
    if (ownRecord) {setDialogUser(ownRecord)}
  }, [currentUser, dialogUser, forceAccountSetup, users])

  const handleSave = async (data: UserFormPayload) => {
    if (dialogUser === 'new') {
      const res = await createUser(data)
      if (res.success) {
        showToast({ type: 'success', title: '邀请已发送' })
        setDialogUser(null)
        fetchData()
      } else {
        const errMap: Record<string, string> = {
          email_required: '请填写邀请邮箱',
          invalid_email: '邮箱格式不正确',
          email_already_exists: '该邮箱已存在管理员账号',
          active_invitation_exists: '该邮箱已有有效邀请，请稍后重试',
          nickname_required: '请填写昵称',
          invalid_permissions: '权限配置无效，请刷新后重试',
          smtp_not_configured: '邮件服务未配置，无法发送邀请',
          send_failed: '邀请邮件发送失败',
          invite_failed: '邀请失败',
        }
        showToast({ type: 'error', title: errMap[res.error ?? ''] ?? res.error ?? '邀请失败' })
      }
      return
    }

    if (dialogUser && typeof dialogUser === 'object') {
      if (dialogUser.role === 'super_admin') {
        const emailChanged = data.email !== (dialogUser.email ?? '')
        const credentialsChanged = forceAccountSetup || emailChanged || Boolean(data.newPassword)
        const res = credentialsChanged
          ? await updateOwnAccount({
              email: data.email || '',
              nickname: data.nickname,
              currentPassword: data.currentPassword,
              newPassword: data.newPassword,
            })
          : await updateOwnNickname(data.nickname)
        if (res.success) {
          showToast({ type: 'success', title: credentialsChanged ? '账号资料已更新' : '昵称已更新' })
          if (credentialsChanged) {await onAccountUpdated?.()}
          setDialogUser(null)
          await fetchData()
        } else {
          const errMap: Record<string, string> = {
            invalid_email: '邮箱格式不正确',
            email_already_exists: '该邮箱已被其他管理员使用',
            current_password_required: '请输入当前密码',
            current_password_incorrect: '当前密码不正确',
            new_password_required: '请设置新密码',
            password_too_short: '新密码至少 10 位',
            password_account_required: '当前账号不支持修改登录凭据',
          }
          showToast({ type: 'error', title: errMap[res.error ?? ''] ?? res.error ?? '更新失败' })
        }
      } else {
        const res = await updateUser(dialogUser._id, { nickname: data.nickname, permissions: data.permissions })
        if (res.success) {
          showToast({ type: 'success', title: '已更新' })
          setDialogUser(null)
          fetchData()
        } else {
          showToast({ type: 'error', title: res.error ?? '更新失败' })
        }
      }
    }
  }

  const handleToggleActive = async (u: AdminUserRecord) => {
    const res = await updateUser(u._id, { isActive: !u.isActive })
    if (res.success) {
      showToast({ type: 'success', title: u.isActive ? '已停用' : '已启用' })
      fetchData()
    }
  }

  const handleDelete = async (u: AdminUserRecord) => {
    const res = await deleteUser(u._id)
    if (res.success) {
      showToast({ type: 'success', title: '已删除' })
      fetchData()
    } else {
      showToast({ type: 'error', title: res.error ?? '删除失败' })
    }
  }

  const handleTransfer = async () => {
    if (!transferTarget || !transferPassword) {return}
    setTransferring(true)
    try {
      const res = await transferSuperAdmin(transferTarget._id, transferPassword)
      if (res.success) {
        showToast({ type: 'success', title: '超级管理员已转让', description: '当前账号已降级为普通管理员' })
        window.location.reload()
        return
      }
      const errMap: Record<string, string> = {
        current_password_incorrect: '当前密码不正确',
        current_password_required: '请输入当前超级管理员密码',
        target_user_not_eligible: '目标账号不存在、已停用或不是普通管理员',
        super_admin_changed: '超级管理员状态已变化，请刷新后重试',
        transfer_in_progress: '已有超级管理员转让正在进行，请稍后重试',
        transfer_failed: '转让失败，请稍后重试',
      }
      showToast({ type: 'error', title: errMap[res.error ?? ''] ?? res.error ?? '转让失败' })
    } finally {
      setTransferring(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-blue-500" />
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">管理员管理</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">邀请、编辑和管理后台管理员</p>
          </div>
        </div>
        <Button onClick={() => setDialogUser('new')}>邀请管理员</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">管理员列表</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-200 border-t-blue-600" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-slate-400 py-8">暂无管理员</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" role="table">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-3 px-2 text-slate-500 dark:text-slate-400 font-medium">用户</th>
                    <th className="text-left py-3 px-2 text-slate-500 dark:text-slate-400 font-medium">角色</th>
                    <th className="text-left py-3 px-2 text-slate-500 dark:text-slate-400 font-medium">登录方式</th>
                    <th className="text-left py-3 px-2 text-slate-500 dark:text-slate-400 font-medium">状态</th>
                    <th className="text-left py-3 px-2 text-slate-500 dark:text-slate-400 font-medium">权限数</th>
                    <th className="text-right py-3 px-2 text-slate-500 dark:text-slate-400 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u._id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <UserAvatar src={u.avatar} name={u.nickname} />
                          <div>
                            <p className="font-medium text-slate-800 dark:text-white">{u.nickname}</p>
                            <p className="text-xs text-slate-400">
                              {[u.loginUsername ? `账号 ${u.loginUsername}` : null, u.email ?? null].filter(Boolean).join(' · ') || '-'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          u.role === 'super_admin'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                        }`}>
                          {u.role === 'super_admin' ? '超级管理员' : '管理员'}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-slate-600 dark:text-slate-300">
                        {LOGIN_PROVIDER_LABELS[u.provider] ?? u.provider}
                      </td>
                      <td className="py-3 px-2">
                        {u.isActive ? (
                          <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-xs">
                            <Check className="h-3 w-3" /> 活跃
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-500 text-xs">
                            <Ban className="h-3 w-3" /> 停用
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-slate-500">
                        {u.role === 'super_admin' ? '全部' : u.permissions.length}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {u.role === 'super_admin' ? (
                          <button onClick={() => setDialogUser(u)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700" title="编辑昵称" aria-label="编辑昵称">
                            <Edit2 className="h-4 w-4 text-slate-400" />
                          </button>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setDialogUser(u)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700" title="编辑" aria-label="编辑">
                              <Edit2 className="h-4 w-4 text-slate-400" />
                            </button>
                            {u.isActive && (
                              <button onClick={() => { setTransferTarget(u); setTransferPassword('') }} className="p-1.5 rounded hover:bg-amber-50 dark:hover:bg-amber-900/20" title="转让超级管理员" aria-label="转让超级管理员">
                                <Crown className="h-4 w-4 text-amber-500" />
                              </button>
                            )}
                            <button onClick={() => handleToggleActive(u)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700" title={u.isActive ? '停用' : '启用'} aria-label={u.isActive ? '停用' : '启用'}>
                              {u.isActive ? <Ban className="h-4 w-4 text-orange-400" /> : <UserCheck className="h-4 w-4 text-green-500" />}
                            </button>
                            <button onClick={() => setDeleteConfirm({ open: true, user: u })} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20" title="删除" aria-label="删除">
                              <Trash2 className="h-4 w-4 text-red-400" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {dialogUser !== null && (
        <UserDialog
          user={dialogUser === 'new' ? null : dialogUser}
          allPermissions={allPermissions}
          forceAccountSetup={Boolean(
            forceAccountSetup &&
            dialogUser !== 'new' &&
            dialogUser._id === currentUser?.id
          )}
          onSave={handleSave}
          onClose={() => {
            if (!forceAccountSetup) {setDialogUser(null)}
          }}
        />
      )}
      <ConfirmDialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false, user: null })}
        onConfirm={() => {
          if (deleteConfirm.user) { handleDelete(deleteConfirm.user) }
          setDeleteConfirm({ open: false, user: null })
        }}
        title="删除管理员"
        message={`确定删除管理员 ${deleteConfirm.user?.nickname ?? ''}？此操作不可撤销。`}
        confirmText="删除"
        cancelText="取消"
        danger
      />
      {transferTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-3">
              <Crown className="h-6 w-6 text-amber-500" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">转让超级管理员</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              将超级管理员转让给“{transferTarget.nickname}”。成功后当前账号会立即降级，此操作只能由新超级管理员再次转让才能撤回。
            </p>
            <div>
              <label className="block text-sm text-slate-600 dark:text-slate-300 mb-1">当前超级管理员密码</label>
              <Input type="password" value={transferPassword} onChange={e => setTransferPassword(e.target.value)} autoComplete="current-password" placeholder="请输入当前密码确认" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTransferTarget(null)} disabled={transferring}>取消</Button>
              <Button onClick={handleTransfer} disabled={transferring || !transferPassword}>
                {transferring ? '转让中...' : '确认转让'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UserManagement
