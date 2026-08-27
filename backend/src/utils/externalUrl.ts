/**
 * Turn a user-entered website into an absolute http(s) URL.
 * Values like "www.youtube.com/@name" must not become same-origin routes.
 */
export function toExternalHref(raw: string | undefined | null): string {
  const value = String(raw || '').trim()
  if (!value) {
    return ''
  }

  if (/^(javascript|data|vbscript):/i.test(value)) {
    return ''
  }

  if (/^https?:\/\//i.test(value)) {
    return value
  }

  if (value.startsWith('//')) {
    return `https:${value}`
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return value
  }

  return `https://${value.replace(/^\/+/, '')}`
}
