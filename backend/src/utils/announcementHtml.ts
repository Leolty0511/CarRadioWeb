const ALLOWED_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'small',
  'strong', 'sub', 'sup', 'u', 'ul'
])

const GLOBAL_ATTRIBUTES = new Set(['class', 'title'])
const TAG_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading'])
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function sanitizeStyle(value: string): string {
  return value
    .split(';')
    .map(declaration => declaration.trim())
    .filter(declaration =>
      /^(?:text-align\s*:\s*(?:left|right|center|justify)|color\s*:\s*(?:#[0-9a-f]{3,8}|rgb\([^)]*\)|rgba\([^)]*\)))$/i.test(declaration)
    )
    .join('; ')
}

/** Keep announcement markup useful while removing scripts and event handlers. */
export function sanitizeAnnouncementHtml(value: string): string {
  if (!value || typeof value !== 'string') return ''

  return value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*([a-z0-9-]+)([^>]*)>/gi, (full, tag: string, attrs: string) => {
      const normalizedTag = tag.toLowerCase()
      if (!ALLOWED_TAGS.has(normalizedTag)) return ''
      if (normalizedTag === 'br' || normalizedTag === 'hr') return `<${normalizedTag}>`

      const safeAttrs: string[] = []
      const attrPattern = /([a-z][a-z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi
      let match: RegExpExecArray | null
      while ((match = attrPattern.exec(attrs)) !== null) {
        const name = match[1].toLowerCase()
        let value = (match[2] ?? match[3] ?? match[4] ?? '').trim()
        const allowed = GLOBAL_ATTRIBUTES.has(name) || TAG_ATTRIBUTES[normalizedTag]?.has(name) || name === 'style'
        if (!allowed || name.startsWith('on')) continue

        if (name === 'href' || name === 'src') {
          if (/^(?:javascript|vbscript|data):/i.test(value)) continue
        }
        if (name === 'style') {
          value = sanitizeStyle(value)
          if (!value) continue
        }
        if (name === 'target' && !['_blank', '_self'].includes(value)) continue
        if (name === 'loading' && !['lazy', 'eager'].includes(value)) continue

        safeAttrs.push(`${name}="${escapeAttribute(value)}"`)
      }
      if (normalizedTag === 'a' && safeAttrs.some(attr => attr === 'target="_blank"')) {
        safeAttrs.push('rel="noopener noreferrer"')
      }
      return `<${normalizedTag}${safeAttrs.length ? ` ${safeAttrs.join(' ')}` : ''}>`
    })
    .replace(/<\s*\/\s*([a-z0-9-]+)\s*>/gi, (full, tag: string) =>
      ALLOWED_TAGS.has(tag.toLowerCase()) ? `</${tag.toLowerCase()}>` : ''
    )
}

export function plainTextToAnnouncementHtml(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim() ? `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>` : '<p><br></p>')
    .join('')
}
