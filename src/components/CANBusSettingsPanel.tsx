import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Settings, ChevronDown, ChevronLeft, ChevronRight, Image, Loader2, Info } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import ReferenceImageModal from '@/components/ReferenceImageModal'
import canbusSettingsService, { type CANBoxType, type HeadUnitType } from '@/services/canbusSettingsService'
import { getVehicles } from '@/services/vehicleService'

/** 文档语言固定英文 */
const mapUILanguageToDocLanguage = (_uiLang: string): 'en' => 'en'

interface VehicleData {
  [brand: string]: {
    [model: string]: {
      [year: string]: { password?: string; vehicleId?: string }
    }
  }
}

interface CANBusSettingsPanelProps {
  // 组件自行加载车型数据，无需外部传入
}

/**
 * CANBus 设置面板组件
 * CANBox 类型展示（识别用途）+ 车型选择 → 显示设置图片和描述
 */
const CANBusSettingsPanel: React.FC<CANBusSettingsPanelProps> = () => {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const documentLanguage = mapUILanguageToDocLanguage(i18n.language)

  // 选择状态
  const [selectedBrand, setSelectedBrand] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [selectedYear, setSelectedYear] = useState('')
  const [selectedVehicleId, setSelectedVehicleId] = useState('')
  const [selectedHeadUnitTypeId, setSelectedHeadUnitTypeId] = useState('')

  // 数据状态
  const [canboxTypes, setCanboxTypes] = useState<CANBoxType[]>([])
  const [headUnitTypes, setHeadUnitTypes] = useState<HeadUnitType[]>([])
  const [internalVehicleData, setInternalVehicleData] = useState<VehicleData>({})
  const [settingData, setSettingData] = useState<{ settingImage: string; settingImages: string[]; description: string } | null>(null)
  const selectedHeadUnitType = headUnitTypes.find(type => type._id === selectedHeadUnitTypeId)
  const canboxCarouselRef = React.useRef<HTMLDivElement>(null)

  // UI 状态
  const [loading, setLoading] = useState(false)
  const [loadingVehicles, setLoadingVehicles] = useState(false)
  const [showDropdown, setShowDropdown] = useState<'brand' | 'model' | 'year' | 'headUnit' | null>(null)
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string; description?: string } | null>(null)

  const scrollCanboxTypes = (direction: 'left' | 'right') => {
    canboxCarouselRef.current?.scrollBy({
      left: direction === 'left' ? -360 : 360,
      behavior: 'smooth'
    })
  }

  // 加载 CANBox 类型列表（仅展示用）
  useEffect(() => {
    const loadCANBoxTypes = async () => {
      try {
        const types = await canbusSettingsService.getCANBoxTypes()
        setCanboxTypes(types)
      } catch (error) {
        console.error('Failed to load CANBox types:', error)
      }
    }
    loadCANBoxTypes()
  }, [])

  useEffect(() => {
    canbusSettingsService.getHeadUnitTypes()
      .then(setHeadUnitTypes)
      .catch(() => setHeadUnitTypes([]))
  }, [])

  // 始终自己加载车型数据，按语言隔离
  useEffect(() => {
    const loadVehicles = async () => {
      setLoadingVehicles(true)
      try {
        // 传入语言参数，获取对应语言的车型
        const vehicles = await getVehicles(documentLanguage)
        const data: VehicleData = {}
        for (const v of vehicles) {
          if (!data[v.brand]) {data[v.brand] = {}}
          if (!data[v.brand][v.model]) {data[v.brand][v.model] = {}}
          data[v.brand][v.model][v.year] = { vehicleId: v._id || '' }
        }
        setInternalVehicleData(data)
      } catch (error) {
        console.error('Failed to load vehicles:', error)
      } finally {
        setLoadingVehicles(false)
      }
    }
    loadVehicles()
  }, [documentLanguage])

  // 使用内部加载的数据
  const vehicleData = internalVehicleData

  // 选择完车型后，需要先获取 vehicleId，再加载设置
  useEffect(() => {
    if (!selectedBrand || !selectedModel || !selectedYear) {
      setSettingData(null)
      setSelectedVehicleId('')
      setSelectedHeadUnitTypeId('')
      return
    }

    const loadSetting = async () => {
      setLoading(true)
      try {
        // 先获取 vehicleId
        let vehicleId = vehicleData[selectedBrand]?.[selectedModel]?.[selectedYear]?.vehicleId

        // 如果没有 vehicleId，需要从 API 查询
        if (!vehicleId) {
          const { findVehicleByBrandModelYear } = await import('@/services/vehicleService')
          const vehicle = await findVehicleByBrandModelYear(selectedBrand, selectedModel, selectedYear)
          vehicleId = vehicle?._id || ''
        }

        if (!vehicleId) {
          setSettingData(null)
          setLoading(false)
          return
        }

        setSelectedVehicleId(vehicleId)
        setSettingData(null)
        if (selectedHeadUnitTypeId) {
          const data = await canbusSettingsService.getSettingByVehicle(vehicleId, selectedHeadUnitTypeId)
          setSettingData(data)
        }
      } catch (error) {
        console.error('Failed to load setting:', error)
        setSettingData(null)
      } finally {
        setLoading(false)
      }
    }
    loadSetting()
  }, [selectedBrand, selectedModel, selectedYear, selectedHeadUnitTypeId, vehicleData])

  const handleBrandSelect = (brand: string) => {
    setSelectedBrand(brand)
    setSelectedModel('')
    setSelectedYear('')
    setSelectedHeadUnitTypeId('')
    setSettingData(null)
    setShowDropdown(null)
  }

  const handleModelSelect = (model: string) => {
    setSelectedModel(model)
    setSelectedYear('')
    setSelectedHeadUnitTypeId('')
    setSettingData(null)
    setShowDropdown(null)
  }

  const handleYearSelect = (year: string) => {
    setSelectedYear(year)
    setSelectedHeadUnitTypeId('')
    setShowDropdown(null)
  }

  const handleHeadUnitTypeSelect = (typeId: string) => {
    setSelectedHeadUnitTypeId(typeId)
    setShowDropdown(null)
  }

  const brands = Object.keys(vehicleData)
  const models = selectedBrand ? Object.keys(vehicleData[selectedBrand] || {}) : []
  const years = selectedBrand && selectedModel
    ? Object.keys(vehicleData[selectedBrand]?.[selectedModel] || {})
    : []

  const closeDropdowns = () => setShowDropdown(null)

  return (
    <div className="space-y-8 relative">
      {/* 点击外部关闭下拉菜单 - 必须在 Card 之前渲染 */}
      {showDropdown && (
        <div
          className="fixed inset-0 z-10"
          onClick={closeDropdowns}
        />
      )}

      {/* 标题区域 */}
      <Card className="bg-white dark:bg-gradient-to-br dark:from-gray-800/50 dark:to-gray-700/50 border border-gray-200 dark:border-gray-600/50 backdrop-blur-sm shadow-xl relative z-20">
        <CardHeader className="pb-6">
          <CardTitle className="flex items-center text-slate-800 dark:text-white text-2xl">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center mr-4">
              <Settings className="h-6 w-6 text-white" />
            </div>
            {t('canbus.title')}
          </CardTitle>
          <CardDescription className="text-slate-600 dark:text-gray-300 text-lg leading-relaxed">
            {t('canbus.description')}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* CANBox 类型展示 - 仅供用户识别设备外观 */}
          {canboxTypes.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-slate-700 dark:text-gray-300">
                {t('canbus.canboxReference')}
              </h4>
              <div className="relative">
                <button
                  type="button"
                  aria-label={t('common.previous')}
                  title={t('common.previous')}
                  onClick={() => scrollCanboxTypes('left')}
                  className="absolute left-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-600 shadow-sm dark:border-gray-600 dark:bg-gray-800/95 dark:text-gray-200"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div
                  ref={canboxCarouselRef}
                  className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-11 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {canboxTypes.map((canbox) => (
                    <div
                      key={canbox._id}
                      className="w-[75%] min-w-[75%] snap-start rounded-xl border border-gray-200 bg-slate-50 p-3 dark:border-gray-600 dark:bg-gray-800/50 sm:w-[48%] sm:min-w-[48%] md:w-[31%] md:min-w-[31%]"
                    >
                      {canbox.image ? (
                        <button
                          type="button"
                          className="block w-full overflow-hidden rounded-lg bg-white dark:bg-gray-900"
                          onClick={() => setPreviewImage({ url: canbox.image, title: canbox.name })}
                        >
                          <img
                            src={canbox.image}
                            alt={canbox.name}
                            className="aspect-square h-full w-full object-cover"
                          />
                        </button>
                      ) : (
                        <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
                          <Settings className="h-8 w-8 text-gray-400" />
                        </div>
                      )}
                      <p className="mt-2 truncate text-center text-xs font-medium text-slate-700 dark:text-gray-300">
                        {canbox.name}
                      </p>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  aria-label={t('common.next')}
                  title={t('common.next')}
                  onClick={() => scrollCanboxTypes('right')}
                  className="absolute right-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-600 dark:border-gray-600 dark:bg-gray-800/95 dark:text-gray-200"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}

          {/* 车型选择器 */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
            <h4 className="text-sm font-medium text-slate-700 dark:text-gray-300 mb-4">
              {t('canbus.selectVehicle')}
            </h4>
            {loadingVehicles ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-orange-500 mr-2" />
                <span className="text-slate-600 dark:text-gray-400">{t('common.loading')}</span>
              </div>
            ) : brands.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-500 dark:text-gray-400">{t('canbus.noVehiclesAvailable')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {/* 品牌选择 */}
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                    {t('canbus.brand')}
                  </label>
                  <Button
                    variant="ghost"
                    className="w-full justify-between border border-slate-300 dark:border-gray-600 text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700 bg-white dark:bg-transparent"
                    onClick={() => setShowDropdown(showDropdown === 'brand' ? null : 'brand')}
                  >
                    {selectedBrand || t('canbus.selectBrand')}
                    <ChevronDown className="h-4 w-4" />
                  </Button>

                  {showDropdown === 'brand' && (
                    <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                      {brands.map(brand => (
                        <button
                          key={brand}
                          className="w-full px-4 py-2 text-left text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700"
                          onClick={() => handleBrandSelect(brand)}
                        >
                          {brand}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 车型选择 */}
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                    {t('canbus.model')}
                  </label>
                  <Button
                    variant="ghost"
                    className="w-full justify-between border border-slate-300 dark:border-gray-600 text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700 bg-white dark:bg-transparent"
                    onClick={() => setShowDropdown(showDropdown === 'model' ? null : 'model')}
                    disabled={!selectedBrand}
                  >
                    {selectedModel || t('canbus.selectModel')}
                    <ChevronDown className="h-4 w-4" />
                  </Button>

                  {showDropdown === 'model' && models.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                      {models.map(model => (
                        <button
                          key={model}
                          className="w-full px-4 py-2 text-left text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700"
                          onClick={() => handleModelSelect(model)}
                        >
                          {model}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 年份选择 */}
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                    {t('canbus.year')}
                  </label>
                  <Button
                    variant="ghost"
                    className="w-full justify-between border border-slate-300 dark:border-gray-600 text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700 bg-white dark:bg-transparent"
                    onClick={() => setShowDropdown(showDropdown === 'year' ? null : 'year')}
                    disabled={!selectedModel}
                  >
                    {selectedYear || t('canbus.selectYear')}
                    <ChevronDown className="h-4 w-4" />
                  </Button>

                  {showDropdown === 'year' && years.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-auto">
                      {years.map(year => (
                        <button
                          key={year}
                          className="w-full px-4 py-2 text-left text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700"
                          onClick={() => handleYearSelect(year)}
                        >
                          {year}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 主机型号选择：必须在车型完成后选择 */}
                <div className="relative md:col-span-2 xl:col-span-1">
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                    {t('canbus.headUnitType')}
                  </label>
                  <Button
                    variant="ghost"
                    className="w-full justify-between border border-slate-300 dark:border-gray-600 text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700 bg-white dark:bg-transparent"
                    onClick={() => setShowDropdown(showDropdown === 'headUnit' ? null : 'headUnit')}
                    disabled={!selectedYear || headUnitTypes.length === 0}
                  >
                    {headUnitTypes.find(type => type._id === selectedHeadUnitTypeId)?.name || t('canbus.selectHeadUnitType')}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  {showDropdown === 'headUnit' && selectedYear && (
                    <div className="absolute z-20 mt-1 w-full max-h-60 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800">
                      {headUnitTypes.map(type => (
                        <button
                          key={type._id}
                          className="w-full px-4 py-2 text-left text-slate-700 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-gray-700"
                          onClick={() => handleHeadUnitTypeSelect(type._id)}
                        >
                          {type.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {selectedHeadUnitType && (
            <div className="mt-4 flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800/60 sm:flex-row sm:items-center">
              {selectedHeadUnitType.image && (
                <img
                  src={selectedHeadUnitType.image}
                  alt={selectedHeadUnitType.name}
                  className="h-24 w-full rounded-lg object-cover sm:h-20 sm:w-32"
                />
              )}
              <div className="min-w-0">
                <h4 className="font-medium text-slate-800 dark:text-white">{selectedHeadUnitType.name}</h4>
                {selectedHeadUnitType.description && (
                  <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-gray-300">
                    {selectedHeadUnitType.description}
                  </p>
                )}
              </div>
            </div>
          )}

          {selectedYear && (
            <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/60 dark:bg-blue-950/25 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                <p className="text-sm leading-relaxed text-blue-800 dark:text-blue-200">
                  {t('canbus.headUnitTypeHint')}
                </p>
              </div>
              <Button
                variant="outline"
                className="flex-shrink-0 border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/40"
                onClick={() => navigate(selectedHeadUnitTypeId ? `/knowledge/device-operation-videos?headUnitTypeId=${encodeURIComponent(selectedHeadUnitTypeId)}` : '/knowledge/device-operation-videos')}
              >
                {t('canbus.viewHeadUnitOperationTutorials')}
              </Button>
            </div>
          )}

          {/* 加载状态 */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            </div>
          )}

          {/* 设置图片和描述展示 */}
          {settingData && !loading && (
            <div className="pt-6 border-t border-gray-200 dark:border-gray-600 space-y-4">
              <h4 className="text-lg font-medium text-slate-800 dark:text-white">
                {t('canbus.settingImage')}
              </h4>

              {/* 描述说明 */}
              {settingData.description && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl">
                  <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
                    {settingData.description}
                  </p>
                </div>
              )}

              {/* 设置图片 */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {(settingData.settingImages?.length ? settingData.settingImages : [settingData.settingImage]).filter(Boolean).map((url, index) => (
                  <button
                    key={url}
                    type="button"
                    className="relative overflow-hidden rounded-xl"
                    onClick={() => setPreviewImage({ url, title: `${selectedBrand} ${selectedModel} ${selectedYear} - CANBus Settings ${index + 1}` })}
                  >
                    <img
                      src={url}
                      alt={`${selectedBrand} ${selectedModel} ${selectedYear} CANBus Settings ${index + 1}`}
                      className="h-auto w-full object-contain bg-slate-100 dark:bg-gray-800"
                    />
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-sm text-white opacity-0 transition hover:bg-black/20 hover:opacity-100">
                      {t('canbus.clickToEnlarge')}
                    </span>
                  </button>
                ))}
              </div>

              {/* 选择信息摘要 */}
              <div className="p-4 bg-slate-50 dark:bg-gray-800 rounded-lg">
                <p className="text-sm text-slate-600 dark:text-gray-400">
                  <span className="font-medium text-slate-800 dark:text-white">{t('canbus.brand')}:</span> {selectedBrand}
                  <span className="mx-2">•</span>
                  <span className="font-medium text-slate-800 dark:text-white">{t('canbus.model')}:</span> {selectedModel}
                  <span className="mx-2">•</span>
                  <span className="font-medium text-slate-800 dark:text-white">{t('canbus.year')}:</span> {selectedYear}
                </p>
              </div>
            </div>
          )}

          {/* 无数据提示 */}
          {selectedVehicleId && selectedHeadUnitTypeId && !settingData && !loading && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <Image className="h-8 w-8 text-gray-400" />
              </div>
              <p className="text-slate-600 dark:text-gray-400">{t('canbus.noSettingFound')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 参考图普通弹窗 */}
      {previewImage && (
        <ReferenceImageModal
          isOpen={Boolean(previewImage)}
          onClose={() => setPreviewImage(null)}
          imageUrl={previewImage.url}
          title={previewImage.title}
          description={previewImage.description}
        />
      )}
    </div>
  )
}

export default CANBusSettingsPanel
