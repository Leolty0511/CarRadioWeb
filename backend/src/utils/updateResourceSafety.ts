export interface LinuxMemorySnapshot {
  totalBytes: number
  availableBytes: number
  swapTotalBytes: number
  swapFreeBytes: number
}

const KIB = 1024

export function parseLinuxMeminfo(content: string): LinuxMemorySnapshot | null {
  const values = new Map<string, number>()
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_()]+):\s+(\d+)\s+kB$/)
    if (match) values.set(match[1], Number.parseInt(match[2], 10) * KIB)
  }

  const totalBytes = values.get('MemTotal')
  const availableBytes = values.get('MemAvailable')
  if (!Number.isFinite(totalBytes) || !Number.isFinite(availableBytes)) return null

  return {
    totalBytes: totalBytes!,
    availableBytes: availableBytes!,
    swapTotalBytes: values.get('SwapTotal') || 0,
    swapFreeBytes: values.get('SwapFree') || 0,
  }
}

export function clampUpdateMemoryLimitMb(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number.parseInt(value || '', 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(maximum, Math.max(minimum, parsed))
}

export function formatMemoryMb(bytes: number): number {
  return Math.max(0, Math.round(bytes / (1024 * 1024)))
}
