import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import canbusSettingsService, { type HeadUnitType } from '@/services/canbusSettingsService'

const STORAGE_KEY = 'car-radio-selected-head-unit-type'

interface HeadUnitTypeContextValue {
  headUnitTypes: HeadUnitType[]
  loading: boolean
  selectedHeadUnitTypeId: string
  selectedHeadUnitType: HeadUnitType | null
  selectHeadUnitType: (id: string) => void
  clearHeadUnitType: () => void
  reloadHeadUnitTypes: () => Promise<void>
}

const HeadUnitTypeContext = createContext<HeadUnitTypeContextValue | undefined>(undefined)

export const HeadUnitTypeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [headUnitTypes, setHeadUnitTypes] = useState<HeadUnitType[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedHeadUnitTypeId, setSelectedHeadUnitTypeId] = useState('')

  useEffect(() => {
    try {
      setSelectedHeadUnitTypeId(window.localStorage.getItem(STORAGE_KEY) || '')
    } catch {
      setSelectedHeadUnitTypeId('')
    }
  }, [])

  const reloadHeadUnitTypes = async () => {
    setLoading(true)
    try {
      const types = await canbusSettingsService.getHeadUnitTypes()
      setHeadUnitTypes(types)
      setSelectedHeadUnitTypeId(current => {
        if (current && types.some(type => type._id === current)) {
          return current
        }
        return ''
      })
    } catch {
      setHeadUnitTypes([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reloadHeadUnitTypes()
  }, [])

  const selectHeadUnitType = (id: string) => {
    setSelectedHeadUnitTypeId(id)
    try {
      window.localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // Local storage may be unavailable in private browsing contexts.
    }
  }

  const clearHeadUnitType = () => {
    setSelectedHeadUnitTypeId('')
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore storage errors and keep the in-memory selection cleared.
    }
  }

  const selectedHeadUnitType = useMemo(
    () => headUnitTypes.find(type => type._id === selectedHeadUnitTypeId) || null,
    [headUnitTypes, selectedHeadUnitTypeId]
  )

  const value = useMemo<HeadUnitTypeContextValue>(() => ({
    headUnitTypes,
    loading,
    selectedHeadUnitTypeId,
    selectedHeadUnitType,
    selectHeadUnitType,
    clearHeadUnitType,
    reloadHeadUnitTypes,
  }), [headUnitTypes, loading, selectedHeadUnitTypeId, selectedHeadUnitType])

  return <HeadUnitTypeContext.Provider value={value}>{children}</HeadUnitTypeContext.Provider>
}

export const useHeadUnitTypes = () => {
  const context = useContext(HeadUnitTypeContext)
  if (!context) {
    throw new Error('useHeadUnitTypes must be used within HeadUnitTypeProvider')
  }
  return context
}

export default HeadUnitTypeContext
