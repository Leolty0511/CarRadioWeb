import React, { useEffect, useState } from 'react'
import { Bell, CheckCircle, Eye, EyeOff, Mail, MessageSquare, Send, Webhook } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { apiClient } from '@/services/apiClient'
import { DingtalkStyleFields, type DingtalkMessageStyle } from '@/components/admin/DingtalkStyleFields'

type Channel = 'wecom' | 'dingtalk' | 'serverchan' | 'email' | 'webhook'

interface ForumNotificationSettings {
  enabled: boolean
  locale: 'en' | 'zh-hans'
  timezone: string
  skipAdminMod: boolean
  channels: {
    wecom: { enabled: boolean; webhook: string }
    dingtalk: { enabled: boolean; webhook: string; secret: string; messageStyle: DingtalkMessageStyle; imageUrl: string }
    serverchan: { enabled: boolean; uid: string; sendKey: string }
    email: { enabled: boolean; recipients: string; host: string; port: number; secure: boolean; user: string; pass: string; from: string }
    webhook: { enabled: boolean; url: string; method: 'POST' | 'PUT'; headers: string }
  }
}

const DEFAULT_SETTINGS: ForumNotificationSettings = {
  enabled: false,
  locale: 'zh-hans',
  timezone: '',
  skipAdminMod: false,
  channels: {
    wecom: { enabled: false, webhook: '' },
    dingtalk: { enabled: false, webhook: '', secret: '', messageStyle: 'markdown', imageUrl: '' },
    serverchan: { enabled: false, uid: '', sendKey: '' },
    email: { enabled: false, recipients: '', host: '', port: 465, secure: true, user: '', pass: '', from: '' },
    webhook: { enabled: false, url: '', method: 'POST', headers: '' },
  },
}

const CHANNELS: Array<{ key: Channel; label: string; icon: React.ElementType }> = [
  { key: 'wecom', label: '企业微信', icon: MessageSquare },
  { key: 'dingtalk', label: '钉钉机器人', icon: MessageSquare },
  { key: 'serverchan', label: 'Server酱', icon: Bell },
  { key: 'email', label: '邮件通知', icon: Mail },
  { key: 'webhook', label: '自定义 Webhook', icon: Webhook },
]

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-blue-500' : 'bg-slate-300 dark:bg-gray-600'}`}
    >
      <span className={`h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

function SecretInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      <button type="button" title={visible ? '隐藏' : '显示'} onClick={() => setVisible((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

export function ForumNotificationPanel({ showToast }: { showToast: (value: { type: 'success' | 'error' | 'info'; title: string; description?: string }) => void }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [activeChannel, setActiveChannel] = useState<Channel>('wecom')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<Channel | null>(null)
  const [tested, setTested] = useState<Channel | null>(null)

  useEffect(() => {
    apiClient.get('/v1/forum/notifications')
      .then((result) => {
        if (result.success && result.data) {
          setSettings(result.data as ForumNotificationSettings)
        } else {
          throw new Error(result.error || '读取论坛推送设置失败')
        }
      })
      .catch((error) => showToast({ type: 'error', title: '读取失败', description: error instanceof Error ? error.message : '' }))
      .finally(() => setLoading(false))
  }, [showToast])

  const updateChannel = (channel: Channel, patch: Record<string, unknown>) => {
    setSettings((current) => ({
      ...current,
      channels: { ...current.channels, [channel]: { ...current.channels[channel], ...patch } },
    }))
    setTested(null)
  }

  const save = async () => {
    try {
      setSaving(true)
      const result = await apiClient.put('/v1/forum/notifications', settings)
      if (!result.success) {
        throw new Error(result.error || '保存失败')
      }
      setSettings(result.data as ForumNotificationSettings)
      showToast({ type: 'success', title: '论坛推送设置已保存' })
    } catch (error) {
      showToast({ type: 'error', title: '保存失败', description: error instanceof Error ? error.message : '' })
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    try {
      setTesting(activeChannel)
      setTested(null)
      const result = await apiClient.post('/v1/forum/notifications/test', { channel: activeChannel, settings })
      if (!result.success) {
        throw new Error(result.error || result.message || '测试失败')
      }
      setTested(activeChannel)
      showToast({ type: 'success', title: '测试消息已发送', description: result.message || '' })
    } catch (error) {
      showToast({ type: 'error', title: '测试失败', description: error instanceof Error ? error.message : '' })
    } finally {
      setTesting(null)
    }
  }

  if (loading) {
    return <div className="py-10 text-center text-sm text-slate-500">正在读取论坛推送设置...</div>
  }

  const channel = settings.channels[activeChannel]
  const activeMeta = CHANNELS.find((item) => item.key === activeChannel)!
  const ActiveIcon = activeMeta.icon

  return (
    <Card>
      <CardHeader className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5" />
            <span>论坛推送</span>
            <Badge variant={settings.enabled ? 'success' : 'secondary'} size="sm">{settings.enabled ? '已启用' : '未启用'}</Badge>
          </CardTitle>
          <p className="mt-1 text-xs text-slate-500">使用独立渠道发送论坛注册、主题和回复通知，不使用“消息推送”页面的渠道。</p>
        </div>
        <Button size="sm" onClick={save} disabled={saving}>{saving ? '保存中...' : '保存全部'}</Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 border-b border-slate-200 pb-5 dark:border-slate-700 lg:grid-cols-2">
          <div className="flex items-center justify-between rounded-md bg-slate-100 p-3 dark:bg-gray-800/50">
            <div><p className="text-sm font-medium">启用论坛推送</p><p className="mt-0.5 text-xs text-slate-500">总开关关闭时不发送任何论坛消息</p></div>
            <Toggle checked={settings.enabled} onChange={(enabled) => setSettings((current) => ({ ...current, enabled }))} label="启用论坛推送" />
          </div>
          <div className="flex items-center justify-between rounded-md bg-slate-100 p-3 dark:bg-gray-800/50">
            <div><p className="text-sm font-medium">忽略管理员和版主发帖</p><p className="mt-0.5 text-xs text-slate-500">仅影响新主题和回复，用户注册仍会通知</p></div>
            <Toggle checked={settings.skipAdminMod} onChange={(skipAdminMod) => setSettings((current) => ({ ...current, skipAdminMod }))} label="忽略管理员和版主发帖" />
          </div>
          <label className="space-y-2 text-sm font-medium">
            <span>推送语言</span>
            <select value={settings.locale} onChange={(event) => setSettings((current) => ({ ...current, locale: event.target.value as 'en' | 'zh-hans' }))} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800">
              <option value="zh-hans">中文</option><option value="en">English</option>
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium">
            <span>当地时区</span>
            <Input value={settings.timezone} onChange={(event) => setSettings((current) => ({ ...current, timezone: event.target.value }))} placeholder="America/New_York（留空只显示北京时间）" />
          </label>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-700">
          {CHANNELS.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.key} type="button" onClick={() => setActiveChannel(item.key)} className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium ${activeChannel === item.key ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
                <Icon className="h-4 w-4" /><span>{item.label}</span>{settings.channels[item.key].enabled && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
              </button>
            )
          })}
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><ActiveIcon className="h-5 w-5" /><h3 className="text-sm font-semibold">{activeMeta.label}</h3></div>
            <div className="flex items-center gap-3">
              {tested === activeChannel && <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle className="h-4 w-4" />测试成功</span>}
              <Button size="sm" variant="outline" onClick={test} disabled={testing !== null}><Send className="mr-1.5 h-4 w-4" />{testing === activeChannel ? '测试中...' : '测试'}</Button>
              <Toggle checked={channel.enabled} onChange={(enabled) => updateChannel(activeChannel, { enabled })} label={`启用${activeMeta.label}`} />
            </div>
          </div>

          {activeChannel === 'wecom' && <label className="block space-y-2 text-sm font-medium"><span>Webhook URL</span><Input value={settings.channels.wecom.webhook} onChange={(event) => updateChannel('wecom', { webhook: event.target.value })} placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..." /></label>}
          {activeChannel === 'dingtalk' && <div className="space-y-4"><div className="grid gap-4 lg:grid-cols-2"><label className="space-y-2 text-sm font-medium"><span>Webhook URL</span><Input value={settings.channels.dingtalk.webhook} onChange={(event) => updateChannel('dingtalk', { webhook: event.target.value })} placeholder="https://oapi.dingtalk.com/robot/send?access_token=..." /></label><label className="space-y-2 text-sm font-medium"><span>加签密钥（可选）</span><SecretInput value={settings.channels.dingtalk.secret} onChange={(secret) => updateChannel('dingtalk', { secret })} placeholder="SEC..." /></label></div><DingtalkStyleFields messageStyle={settings.channels.dingtalk.messageStyle} imageUrl={settings.channels.dingtalk.imageUrl} onChange={(patch) => updateChannel('dingtalk', patch)} /></div>}
          {activeChannel === 'serverchan' && <div className="grid gap-4 lg:grid-cols-2"><label className="space-y-2 text-sm font-medium"><span>UID（ServerChan3，可留空）</span><Input value={settings.channels.serverchan.uid} onChange={(event) => updateChannel('serverchan', { uid: event.target.value })} /></label><label className="space-y-2 text-sm font-medium"><span>SendKey</span><SecretInput value={settings.channels.serverchan.sendKey} onChange={(sendKey) => updateChannel('serverchan', { sendKey })} placeholder="SCT... 或 sctp..." /></label></div>}
          {activeChannel === 'email' && <div className="grid gap-4 lg:grid-cols-2"><label className="space-y-2 text-sm font-medium lg:col-span-2"><span>收件邮箱</span><Input value={settings.channels.email.recipients} onChange={(event) => updateChannel('email', { recipients: event.target.value })} placeholder="admin@example.com, manager@example.com" /><span className="block text-xs font-normal text-slate-500">多个邮箱使用英文逗号分隔。</span></label><label className="space-y-2 text-sm font-medium"><span>SMTP 主机</span><Input value={settings.channels.email.host} onChange={(event) => updateChannel('email', { host: event.target.value })} placeholder="smtp.example.com" /></label><label className="space-y-2 text-sm font-medium"><span>端口</span><Input type="number" value={String(settings.channels.email.port)} onChange={(event) => updateChannel('email', { port: Number(event.target.value) })} /></label><label className="space-y-2 text-sm font-medium"><span>SMTP 账号</span><Input value={settings.channels.email.user} onChange={(event) => updateChannel('email', { user: event.target.value })} /></label><label className="space-y-2 text-sm font-medium"><span>密码 / 授权码</span><SecretInput value={settings.channels.email.pass} onChange={(pass) => updateChannel('email', { pass })} placeholder="密码或授权码" /></label><label className="space-y-2 text-sm font-medium"><span>发件地址</span><Input value={settings.channels.email.from} onChange={(event) => updateChannel('email', { from: event.target.value })} placeholder="默认使用 SMTP 账号" /></label><div className="flex items-center justify-between rounded-md bg-slate-100 p-3 dark:bg-gray-800/50"><span className="text-sm font-medium">SSL/TLS</span><Toggle checked={settings.channels.email.secure} onChange={(secure) => updateChannel('email', { secure })} label="SMTP SSL/TLS" /></div></div>}
          {activeChannel === 'webhook' && <div className="space-y-4"><label className="block space-y-2 text-sm font-medium"><span>Webhook URL</span><Input value={settings.channels.webhook.url} onChange={(event) => updateChannel('webhook', { url: event.target.value })} placeholder="https://example.com/webhook" /></label><div className="flex gap-2">{(['POST', 'PUT'] as const).map((method) => <Button key={method} type="button" size="sm" variant={settings.channels.webhook.method === method ? 'primary' : 'outline'} onClick={() => updateChannel('webhook', { method })}>{method}</Button>)}</div><label className="block space-y-2 text-sm font-medium"><span>自定义请求头</span><textarea rows={4} value={settings.channels.webhook.headers} onChange={(event) => updateChannel('webhook', { headers: event.target.value })} placeholder={'Authorization: Bearer token\nX-Custom-Header: value'} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-600 dark:bg-slate-800" /><span className="block text-xs font-normal text-slate-500">每行一个，格式为 Header-Name: value。</span></label></div>}
        </div>
      </CardContent>
    </Card>
  )
}
