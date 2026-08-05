import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import moduleSettingsService, { type KnowledgeSectionKey } from '@/services/moduleSettingsService'

export function useKnowledgeSection(section: KnowledgeSectionKey): boolean | null {
  const navigate = useNavigate()
  const [enabled, setEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    moduleSettingsService.getPublicKnowledgeSettings()
      .then(settings => {
        if (!active) {return}
        const nextEnabled = settings[section] !== false
        setEnabled(nextEnabled)
        if (!nextEnabled) {navigate('/knowledge', { replace: true })}
      })
      .catch(() => {
        if (active) {setEnabled(true)}
      })
    return () => { active = false }
  }, [navigate, section])

  return enabled
}
