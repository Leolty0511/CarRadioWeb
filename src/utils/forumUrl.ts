/**
 * 论坛地址统一派生逻辑：不依赖用户手动配置
 * - 开发环境（localhost/127.0.0.1）=> http://localhost:8888
 * - 生产环境 => https://forum.${主域名}
 */
export function getForumBaseUrl(): string {
  if (typeof window === 'undefined') {return '';}
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:8888';
  }
  const domain = host.replace(/^www\./, '');
  return `https://forum.${domain}`;
}

/** Direct Flarum entry: logged-in users go through main-site SSO. */
export function getForumEntryUrl(isLoggedIn: boolean): string {
  const base = getForumBaseUrl()
  if (!base) {return '/forum'}
  return isLoggedIn ? `${base}/auth/passport` : base
}

/** Jump straight to Flarum when it is installed. Returns false so the caller can use /forum. */
export function goToForumIfReady(deployed: boolean | null, isLoggedIn: boolean): boolean {
  if (deployed !== true) {return false}
  const url = getForumEntryUrl(isLoggedIn)
  if (!url || url === '/forum') {return false}
  window.location.assign(url)
  return true
}
