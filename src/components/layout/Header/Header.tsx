/**
 * Header 主组件
 * 作为容器组件，整合导航、搜索、语言切换等功能
 */

import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { LogOut, Menu, Search, ArrowUp, UserRound } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import SearchBar from '@/components/SearchBar'
import { DesktopNav } from './DesktopNav'
import { MobileNav } from './MobileNav'
import { MobileSearch } from './MobileSearch'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ThemeSwitcher } from './ThemeSwitcher'
import { Logo } from '@/components/ui/Logo'
import type { NavItem } from '@/config/navigation'
import { useLanguage } from '@/hooks/useLanguage'
import { getApiBaseUrl } from '@/services/apiClient'

// 滚动阈值
const SCROLL_THRESHOLD = 50
const SHOW_BACK_TOP_THRESHOLD = 300

interface HeaderProps {
  navigationItems: NavItem[]
  /** 页面是否使用透明背景（沉浸式页面），Header 需要强制不透明 */
  shouldTransparentBg?: boolean
  announcementControl?: React.ReactNode
}

export const Header: React.FC<HeaderProps> = ({ navigationItems, shouldTransparentBg = false, announcementControl }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { getLocalizedPath } = useLanguage()
  const { isAuthenticated, user, logout } = useAuth()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [isHeaderVisible, setIsHeaderVisible] = useState(true)
  const [showBackTop, setShowBackTop] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const lastScrollY = useRef(0)

  // 监听滚动 - PC固定，移动端滚动下隐藏/上显示
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      const isMobile = window.innerWidth < 768

      setIsScrolled(currentScrollY > SCROLL_THRESHOLD)
      setShowBackTop(currentScrollY > SHOW_BACK_TOP_THRESHOLD)

      if (isMobile) {
        // 移动端：向下滚动隐藏，向上滚动显示
        if (currentScrollY > lastScrollY.current && currentScrollY > SCROLL_THRESHOLD) {
          setIsHeaderVisible(false)
        } else {
          setIsHeaderVisible(true)
        }
      } else {
        // PC端：始终显示
        setIsHeaderVisible(true)
      }

      lastScrollY.current = currentScrollY
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [])

  // 返回顶部
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // 沉浸式页面时，Header 需要半透明背景以保证可读性
  const headerBgClass = shouldTransparentBg
    ? 'bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-white/20 dark:border-slate-700/50'
    : isScrolled
      ? 'bg-white/95 dark:bg-slate-900/95 shadow-lg border-gray-200/50 dark:border-slate-700/50'
      : 'bg-white/80 dark:bg-slate-900/80 border-gray-200 dark:border-slate-700'

  return (
    <>
      <header className={`
        header-nav backdrop-blur-xl border-b fixed top-0 left-0 right-0 z-50 
        transition-all duration-300
        ${headerBgClass}
        ${isHeaderVisible ? 'translate-y-0' : 'md:translate-y-0 -translate-y-full'}
      `}>
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className={`
            flex items-center transition-all duration-300
            ${isScrolled ? 'h-14' : 'h-16'}
          `}>
            {/* Logo - 点击返回首页（forum 子域名时跳回主站） */}
            <div
              className="group mr-2 flex min-w-0 flex-1 cursor-pointer items-center overflow-hidden sm:mr-4 md:mr-6 md:flex-none md:flex-shrink-0 md:overflow-visible"
              onClick={() => {
                const mainOrigin = getApiBaseUrl()
                if (mainOrigin) {
                  window.location.href = mainOrigin + getLocalizedPath('/')
                } else {
                  navigate(getLocalizedPath('/'))
                }
              }}
            >
              <Logo
                size={isScrolled ? 'sm' : 'md'}
                className="min-w-0 max-w-full transition-all duration-300 group-hover:scale-105"
                textClassName="block max-w-full overflow-hidden text-ellipsis"
              />
            </div>

            {/* 桌面端导航 - 紧跟 Logo */}
            <div className="hidden md:flex flex-1">
              <DesktopNav items={navigationItems} />
            </div>

            {/* 右侧工具区 */}
            <div className="flex items-center gap-2 lg:gap-3 ml-auto">
              {/* 桌面端搜索栏 - 只显示图标按钮 */}
              <div className="hidden lg:block">
                <SearchBar
                  onResultClick={(result) => {
                    const mainOrigin = getApiBaseUrl()
                    if (mainOrigin && !result.href.startsWith('http')) {
                      window.location.href = mainOrigin + result.href
                    } else {
                      navigate(result.href)
                    }
                  }}
                  compact
                />
              </div>

              {/* 移动端/平板搜索按钮 */}
              <button
                onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
                className="hidden rounded-lg p-2 text-slate-600 transition-colors hover:bg-gray-100 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white sm:inline-flex lg:hidden"
                title={t('search.placeholder')}
              >
                <Search className="h-5 w-5" />
              </button>

              {announcementControl}

              {/* 主题切换器 */}
              <ThemeSwitcher />

              {/* 语言切换器 */}
              <div className="hidden sm:block">
                <LanguageSwitcher />
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (isAuthenticated && user?.type === 'member') {setAccountMenuOpen(open => !open)}
                    else {navigate(getLocalizedPath('/login'))}
                  }}
                  className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-gray-100 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
                  title={isAuthenticated ? user?.nickname : t('memberAccess.loginOrRegister')}
                  aria-label={isAuthenticated ? user?.nickname : t('memberAccess.loginOrRegister')}
                  aria-expanded={accountMenuOpen}
                >
                  <UserRound className="h-5 w-5" />
                </button>
                {isAuthenticated && user?.type === 'member' && accountMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-44 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <button type="button" onClick={() => { setAccountMenuOpen(false); navigate(getLocalizedPath('/profile')) }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                      <UserRound className="h-4 w-4" />{t('memberAccess.profile')}
                    </button>
                    <button type="button" onClick={async () => { await logout(); setAccountMenuOpen(false); navigate(getLocalizedPath('/')) }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                      <LogOut className="h-4 w-4" />{t('memberAccess.logout')}
                    </button>
                  </div>
                )}
              </div>

              {/* 移动端菜单按钮 */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden p-2 rounded-lg text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* 移动端搜索栏 */}
          <MobileSearch
            isOpen={mobileSearchOpen}
            onClose={() => setMobileSearchOpen(false)}
          />
        </div>
      </header>

      {/* 移动端侧边栏 */}
      <MobileNav
        items={navigationItems}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* 返回顶部按钮 - 仅移动端显示 */}
      <button
        onClick={scrollToTop}
        className={`
          md:hidden fixed bottom-6 right-6 z-50 p-3 
          bg-blue-500 hover:bg-blue-600 text-white 
          rounded-full shadow-lg 
          transition-all duration-300
          ${showBackTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}
        `}
        aria-label={t('common.backToTop')}
      >
        <ArrowUp className="h-5 w-5" />
      </button>
    </>
  )
}

export default Header
