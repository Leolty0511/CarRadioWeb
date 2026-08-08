export type MemberDeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown'

export interface MemberDeviceInfo {
  type: MemberDeviceType
  os: string
  browser: string
  browserVersion: string
}

/** Keep member device telemetry small and human-readable for the admin list. */
export function parseMemberDevice(userAgent: string): MemberDeviceInfo {
  const ua = userAgent || ''
  const lower = ua.toLowerCase()

  let type: MemberDeviceType = 'desktop'
  if (/ipad|tablet|playbook|silk/i.test(lower)) type = 'tablet'
  else if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(lower)) type = 'mobile'
  else if (!lower) type = 'unknown'

  let os = 'Unknown'
  if (/windows nt 10/i.test(lower)) os = 'Windows 10/11'
  else if (/windows nt 6\.3/i.test(lower)) os = 'Windows 8.1'
  else if (/windows nt 6\.2/i.test(lower)) os = 'Windows 8'
  else if (/windows nt 6\.1/i.test(lower)) os = 'Windows 7'
  else if (/windows/i.test(lower)) os = 'Windows'
  else if (/iphone|ipad|ipod/i.test(lower)) os = 'iOS'
  else if (/android/i.test(lower)) os = 'Android'
  else if (/mac os x/i.test(lower)) os = 'macOS'
  else if (/linux/i.test(lower)) os = 'Linux'

  let browser = 'Unknown'
  let browserVersion = ''
  const browserMatchers: Array<[RegExp, string]> = [
    [/edg\/(\d+)/i, 'Edge'],
    [/(?:opr|opera)\/(\d+)/i, 'Opera'],
    [/firefox\/(\d+)/i, 'Firefox'],
    [/chrome\/(\d+)/i, 'Chrome'],
    [/version\/(\d+).*safari/i, 'Safari'],
  ]
  for (const [matcher, name] of browserMatchers) {
    const match = lower.match(matcher)
    if (match) {
      browser = name
      browserVersion = match[1] || ''
      break
    }
  }

  return { type, os, browser, browserVersion }
}

export function formatMemberDevice(info: MemberDeviceInfo): string {
  const browser = info.browserVersion ? `${info.browser} ${info.browserVersion}` : info.browser
  return `${info.type} / ${info.os} / ${browser}`
}
