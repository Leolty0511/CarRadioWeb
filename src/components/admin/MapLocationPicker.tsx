import React, { useCallback, useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, Loader2, Search, Unlock } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export interface MapLocationPickerChange {
  mapLat: number
  mapLng: number
  mapZoom: number
  mapAddress?: string
}

export type MapGeocodeLanguage = 'zh' | 'en'

interface MapLocationPickerProps {
  lat: number
  lng: number
  zoom: number
  onChange: (patch: Partial<MapLocationPickerChange>) => void
  /** 为 false 时仅更新坐标与缩放，不请求逆地理 */
  syncAddressOnPick: boolean
  /** 逆地理返回的 display_name 语言（Nominatim accept-language） */
  geocodeLanguage: MapGeocodeLanguage
  editable?: boolean
  onEditRequest?: () => void
}

const DEFAULT_UA = 'AutomotiveHu-Admin/1.0 (site settings; https://www.openstreetmap.org/copyright)'

function acceptLanguageHeader(lang: MapGeocodeLanguage): string {
  return lang === 'en' ? 'en-US,en' : 'zh-CN,zh;q=0.9,en;q=0.8'
}

async function reverseGeocode(
  lat: number,
  lng: number,
  lang: MapGeocodeLanguage
): Promise<string | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'json')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lng))
  url.searchParams.set('zoom', '18')
  url.searchParams.set('accept-language', acceptLanguageHeader(lang))

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': DEFAULT_UA,
      'Accept-Language': acceptLanguageHeader(lang),
    },
  })
  if (!res.ok) {return null}
  const data = (await res.json()) as { display_name?: string }
  return data.display_name?.trim() || null
}

interface SearchResult {
  display_name: string
  lat: string
  lon: string
}

async function searchPlaces(query: string, lang: MapGeocodeLanguage): Promise<SearchResult[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '6')
  url.searchParams.set('accept-language', acceptLanguageHeader(lang))
  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': DEFAULT_UA,
      'Accept-Language': acceptLanguageHeader(lang),
    },
  })
  if (!res.ok) {throw new Error('search_failed')}
  return (await res.json()) as SearchResult[]
}

function createMarkerIcon() {
  return L.divIcon({
    className: 'map-location-picker-marker',
    html: `<div style="width:26px;height:26px;background:#2563eb;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);margin:-13px 0 0 -13px"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  })
}

export const MapLocationPicker: React.FC<MapLocationPickerProps> = ({
  lat,
  lng,
  zoom,
  onChange,
  syncAddressOnPick,
  geocodeLanguage,
  editable = true,
  onEditRequest,
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastEmittedRef = useRef<{ lat: number; lng: number }>({ lat, lng })
  const onChangeRef = useRef(onChange)
  const syncRef = useRef(syncAddressOnPick)
  const geocodeLangRef = useRef(geocodeLanguage)
  const editableRef = useRef(editable)
  onChangeRef.current = onChange
  syncRef.current = syncAddressOnPick
  geocodeLangRef.current = geocodeLanguage
  editableRef.current = editable
  const latRef = useRef(lat)
  const lngRef = useRef(lng)
  latRef.current = lat
  lngRef.current = lng

  const [geocodeLoading, setGeocodeLoading] = useState(false)
  const [geocodeError, setGeocodeError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const runReverseGeocode = useCallback(async (nextLat: number, nextLng: number) => {
    if (!syncRef.current) {return}
    setGeocodeLoading(true)
    setGeocodeError(null)
    try {
      const name = await reverseGeocode(nextLat, nextLng, geocodeLangRef.current)
      if (name) {
        onChangeRef.current({ mapAddress: name })
      } else {
        setGeocodeError('未能解析地址，可稍后重试或手动填写')
      }
    } catch {
      setGeocodeError('地址查询失败，请检查网络或手动填写')
    } finally {
      setGeocodeLoading(false)
    }
  }, [])

  const scheduleGeocodeRef = useRef<(nextLat: number, nextLng: number) => void>(() => {})

  scheduleGeocodeRef.current = (nextLat: number, nextLng: number) => {
    if (!syncRef.current) {return}
    if (debounceRef.current) {clearTimeout(debounceRef.current)}
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      void runReverseGeocode(nextLat, nextLng)
    }, 700)
  }

  // 仅挂载一次创建地图，避免拖动选点后因 props 变化整图重建
  useEffect(() => {
    const el = wrapRef.current
    if (!el) {return}

    const map = L.map(el, { zoomControl: true, scrollWheelZoom: true }).setView([lat, lng], zoom)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    const marker = L.marker([lat, lng], { draggable: editableRef.current, icon: createMarkerIcon() }).addTo(map)

    markerRef.current = marker
    mapRef.current = map
    lastEmittedRef.current = { lat, lng }

    const emitPosition = (nextLat: number, nextLng: number, nextZoom?: number) => {
      if (!editableRef.current) {return}
      lastEmittedRef.current = { lat: nextLat, lng: nextLng }
      onChangeRef.current({
        mapLat: nextLat,
        mapLng: nextLng,
        mapZoom: nextZoom ?? map.getZoom(),
      })
      scheduleGeocodeRef.current(nextLat, nextLng)
    }

    marker.on('dragend', () => {
      if (!editableRef.current) {return}
      const p = marker.getLatLng()
      emitPosition(p.lat, p.lng)
    })

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!editableRef.current) {return}
      const p = e.latlng
      marker.setLatLng(p)
      emitPosition(p.lat, p.lng)
    })

    map.on('zoomend', () => {
      if (!editableRef.current) {return}
      const p = marker.getLatLng()
      onChangeRef.current({ mapLat: p.lat, mapLng: p.lng, mapZoom: map.getZoom() })
    })

    return () => {
      if (debounceRef.current) {clearTimeout(debounceRef.current)}
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // 初始中心仅取首次渲染
  }, [])

  // 外部输入框修改经纬度/缩放时同步地图
  useEffect(() => {
    const map = mapRef.current
    const marker = markerRef.current
    if (!map || !marker) {return}

    if (editable) {
      map.dragging.enable()
      map.scrollWheelZoom.enable()
      marker.dragging?.enable()
    } else {
      map.dragging.disable()
      map.scrollWheelZoom.disable()
      marker.dragging?.disable()
    }

    const last = lastEmittedRef.current
    const same =
      Math.abs(last.lat - lat) < 1e-8 &&
      Math.abs(last.lng - lng) < 1e-8 &&
      Math.abs(map.getZoom() - zoom) < 0.05
    if (same) {return}

    marker.setLatLng([lat, lng])
    map.setView([lat, lng], zoom, { animate: false })
    lastEmittedRef.current = { lat, lng }
  }, [lat, lng, zoom, editable])

  // 仅切换逆地理语言或重新打开「自动更新地址」时用当前坐标重拉（避免拖动地图时反复请求）
  useEffect(() => {
    if (!syncAddressOnPick) {return}
    const t = setTimeout(() => {
      void runReverseGeocode(latRef.current, lngRef.current)
    }, 350)
    return () => clearTimeout(t)
  }, [geocodeLanguage, syncAddressOnPick, runReverseGeocode])

  const handleManualGeocode = () => {
    void runReverseGeocode(lat, lng)
  }

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault()
    const query = searchQuery.trim()
    if (!editable || !query) {return}
    setSearchLoading(true)
    setSearchError(null)
    try {
      const results = await searchPlaces(query, geocodeLanguage)
      setSearchResults(results)
      if (results.length === 0) {setSearchError('未找到匹配地点，请换一个关键词')}
    } catch {
      setSearchResults([])
      setSearchError('地点搜索失败，请检查网络后重试')
    } finally {
      setSearchLoading(false)
    }
  }

  const handleSelectSearchResult = (result: SearchResult) => {
    if (!editable) {return}
    const nextLat = Number(result.lat)
    const nextLng = Number(result.lon)
    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {return}
    const nextZoom = Math.max(mapRef.current?.getZoom() || zoom, 14)
    markerRef.current?.setLatLng([nextLat, nextLng])
    mapRef.current?.setView([nextLat, nextLng], nextZoom, { animate: false })
    onChangeRef.current({ mapLat: nextLat, mapLng: nextLng, mapZoom: nextZoom, mapAddress: result.display_name })
    lastEmittedRef.current = { lat: nextLat, lng: nextLng }
    setSearchQuery(result.display_name)
    setSearchResults([])
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <span>点击地图或拖动蓝色标记选点；滚轮缩放会写入「缩放」。</span>
      </div>

      <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-gray-800/60 dark:text-slate-300">
        <span>{editable ? '位置编辑已开启，保存后会重新锁定。' : '默认地图位置已锁定。'}</span>
        {!editable && onEditRequest && (
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onEditRequest}>
            <Unlock className="mr-1 h-3.5 w-3.5" />
            修改位置
          </Button>
        )}
      </div>

      <form onSubmit={handleSearch} className="relative flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            disabled={!editable || searchLoading}
            placeholder="搜索城市、地址或地标"
            className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <Button type="submit" size="sm" disabled={!editable || searchLoading || !searchQuery.trim()}>
          {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : '搜索'}
        </Button>
      </form>

      {searchResults.length > 0 && (
        <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-gray-800">
          {searchResults.map((result) => (
            <button
              key={`${result.lat}-${result.lon}`}
              type="button"
              onClick={() => handleSelectSearchResult(result)}
              className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 last:border-b-0 hover:bg-blue-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <span className="block truncate">{result.display_name}</span>
            </button>
          ))}
        </div>
      )}
      {searchError && <p className="text-xs text-amber-600 dark:text-amber-400">{searchError}</p>}

      <div
        ref={wrapRef}
        className="h-[min(320px,50vh)] w-full min-h-[220px] overflow-hidden rounded-lg border border-slate-300 dark:border-slate-600 z-0 [&_.leaflet-container]:font-sans"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={handleManualGeocode}
          disabled={!editable || geocodeLoading || !syncAddressOnPick}
          title={!syncAddressOnPick ? '请先勾选「选点后自动更新地址文案」' : undefined}
        >
          {geocodeLoading ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              查询中…
            </>
          ) : (
            '按当前坐标更新地址'
          )}
        </Button>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-500">
        地址由 OpenStreetMap Nominatim 逆地理生成，仅供参考；可随时手动修改下方文案。
      </p>
      {geocodeError && <p className="text-xs text-amber-600 dark:text-amber-400">{geocodeError}</p>}
    </div>
  )
}
