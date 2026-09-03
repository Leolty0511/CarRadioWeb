import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { isPublicGuidePath } from '@/utils/publicGuide'

export function useGuideViewSession() {
  const location = useLocation()
  const isPublicGuide = isPublicGuidePath(location.pathname)
  const [ready, setReady] = useState(!isPublicGuide)

  useEffect(() => {
    if (!isPublicGuide) {
      setReady(true)
      return
    }

    let active = true
    setReady(false)
    fetch('/api/guide-view/session', { credentials: 'include' })
      .catch(() => undefined)
      .finally(() => {
        if (active) {setReady(true)}
      })

    return () => {
      active = false
    }
  }, [isPublicGuide])

  return { isPublicGuide, ready }
}
