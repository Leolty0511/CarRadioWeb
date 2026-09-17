import { useEffect, useState } from 'react'

const STORAGE_KEY = 'carradioweb-forum-deployed'
let memory: boolean | null = null
let inflight: Promise<boolean> | null = null

function readCached(): boolean | null {
  if (memory !== null) return memory
  try {
    const cached = sessionStorage.getItem(STORAGE_KEY)
    if (cached === '1') return true
    if (cached === '0') return false
  } catch {
    // sessionStorage may be blocked
  }
  return null
}

function writeCached(value: boolean): void {
  memory = value
  try {
    sessionStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // sessionStorage may be blocked
  }
}

function loadForumDeployed(): Promise<boolean> {
  if (inflight) return inflight
  inflight = fetch('/api/v1/forum/public-status')
    .then((res) => res.json())
    .then((data) => data?.success === true && data.deployed === true)
    .catch(() => false)
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** Whether Flarum is actually installed. null = still checking. */
export function useForumDeployed(enabled: boolean): boolean | null {
  const [deployed, setDeployed] = useState<boolean | null>(() => (enabled ? readCached() : false))

  useEffect(() => {
    if (!enabled) {
      setDeployed(false)
      return
    }
    let cancelled = false
    const cached = readCached()
    if (cached !== null) setDeployed(cached)
    void loadForumDeployed().then((value) => {
      writeCached(value)
      if (!cancelled) setDeployed(value)
    })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return enabled ? deployed : false
}
