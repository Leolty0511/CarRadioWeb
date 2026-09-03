import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import moduleSettingsService, { type KnowledgeSectionKey } from '@/services/moduleSettingsService'
import { toPublicGuideHref } from '@/utils/publicGuide'

export function useKnowledgeSection(section: KnowledgeSectionKey): boolean | null {
  const navigate = useNavigate()
  const location = useLocation()
  const [enabled, setEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    moduleSettingsService.getPublicKnowledgeSettings()
      .then(settings => {
        if (!active) {return}
        const nextEnabled = settings[section] !== false
        setEnabled(nextEnabled)
        if (!nextEnabled) {navigate(toPublicGuideHref(location.pathname, '/knowledge'), { replace: true })}
      })
      .catch(() => {
        if (active) {setEnabled(true)}
      })
    return () => { active = false }
  }, [location.pathname, navigate, section])

  return enabled
}
