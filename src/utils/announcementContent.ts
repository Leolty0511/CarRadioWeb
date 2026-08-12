import { sanitizeHTML } from '@/utils/sanitize'

export function normalizeAnnouncementText(value: string = ''): string {
  return value
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n?/g, '\n')
}

export function plainTextToAnnouncementHtml(value: string = ''): string {
  return normalizeAnnouncementText(value)
    .split('\n')
    .map(line => line.trim()
      ? `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`
      : '<p><br /></p>')
    .join('')
}

export function announcementHtmlToPlainText(value: string = ''): string {
  if (!value) { return '' }
  if (typeof window === 'undefined') { return value.replace(/<[^>]+>/g, ' ').trim() }
  const container = document.createElement('div')
  container.innerHTML = sanitizeHTML(value)
  return normalizeAnnouncementText(container.innerText || container.textContent || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function getAnnouncementHtml(content: string = '', contentHtml?: string): string {
  return contentHtml?.trim() ? contentHtml : plainTextToAnnouncementHtml(content)
}

export function getAnnouncementDisplayTitle(title: string = '', content: string = '', fallback: string): string {
  const configured = normalizeAnnouncementText(title).replace(/\s+/g, ' ').trim()
  if (!configured) { return fallback }

  // Older announcements used the first 160 body characters as a generated title.
  const normalizedContent = normalizeAnnouncementText(content).replace(/\s+/g, ' ').trim()
  const isLegacyBodyTitle = configured.length >= 32 && normalizedContent.startsWith(configured)
  return isLegacyBodyTitle ? fallback : configured
}
