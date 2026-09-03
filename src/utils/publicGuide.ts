export const PUBLIC_GUIDE_PREFIX = '/guide'

export function stripLocalePrefix(pathname: string): string {
  return pathname.replace(/^\/(en|ru|zh)(?=\/|$)/, '') || '/'
}

export function isPublicGuidePath(pathname: string): boolean {
  const path = stripLocalePrefix(pathname)
  return path === PUBLIC_GUIDE_PREFIX || path.startsWith(`${PUBLIC_GUIDE_PREFIX}/`)
}

/** Map member knowledge/manual hrefs onto /guide when the visitor is on the QR entry. */
export function toPublicGuideHref(pathname: string, href: string): string {
  if (!isPublicGuidePath(pathname)) {return href}

  const [path, query] = href.split('?')
  const suffix = query ? `?${query}` : ''

  if (path === '/knowledge' || path === '/knowledge/') {
    return `${PUBLIC_GUIDE_PREFIX}${suffix}`
  }
  if (path.startsWith('/knowledge/')) {
    return `${PUBLIC_GUIDE_PREFIX}${path.slice('/knowledge'.length)}${suffix}`
  }
  if (path === '/user-manual' || path.startsWith('/user-manual/')) {
    return `${PUBLIC_GUIDE_PREFIX}${path}${suffix}`
  }
  return href
}
