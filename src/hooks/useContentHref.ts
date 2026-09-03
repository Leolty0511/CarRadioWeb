import { useLocation } from 'react-router-dom'
import { isPublicGuidePath, toPublicGuideHref } from '@/utils/publicGuide'

export function useContentHref() {
  const location = useLocation()
  const isPublicGuide = isPublicGuidePath(location.pathname)
  const contentHref = (path: string) => toPublicGuideHref(location.pathname, path)

  return { isPublicGuide, contentHref }
}
