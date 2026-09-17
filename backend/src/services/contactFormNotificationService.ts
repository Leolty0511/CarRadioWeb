export type ContactFormEmailStatus =
  | { status: 'sent'; recipient: string }
  | { status: 'disabled' }
  | { status: 'misconfigured' }
  | { status: 'failed' }

export interface ContactFormEmailSettings {
  contactFormEmailTo?: string
  newsletterSmtp?: {
    enabled?: boolean
    user?: string
  }
}

export function resolveContactFormEmailRecipient(settings: ContactFormEmailSettings | null | undefined): string {
  return String(settings?.newsletterSmtp?.user || settings?.contactFormEmailTo || '').trim()
}

export function contactFormEmailStatusText(result: ContactFormEmailStatus): string {
  if (result.status === 'sent') {
    return `邮件通知状态：已发送至 ${result.recipient}`
  }
  if (result.status === 'disabled') {
    return '邮件通知状态：未开启，表单仅保存在网站后台'
  }
  if (result.status === 'misconfigured') {
    return '邮件通知状态：配置不完整，未发送'
  }
  return '邮件通知状态：发送失败，请在网站后台查看表单'
}
