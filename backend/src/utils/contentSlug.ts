/**
 * 生成适合公开内容详情页的稳定 slug。
 * 不使用 MongoDB ID，避免把内部数据标识放进前台 URL。
 */
export function toContentSlug(value: string, fallback = 'resource'): string {
  const slug = value
    .normalize('NFKD')
    .toLowerCase()
    .trim()
    .replace(/['’`]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')

  return slug || `${fallback}-${Date.now().toString(36)}`
}
