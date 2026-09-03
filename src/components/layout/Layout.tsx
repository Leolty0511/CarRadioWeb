/**
 * 主布局组件
 * 精简后只负责组合 Header、Main、Footer
 */

import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'
import AnnouncementBanner from '@/components/AnnouncementBanner'
import { useAuth } from '@/contexts/AuthContext'
import { useSiteSettings } from '@/contexts/SiteSettingsContext'
import { getNavigationConfig, filterNavigationByRoles } from '@/config/navigation'
import { getAnnouncement, getAnnouncementHistory, Announcement, AnnouncementHistoryItem } from '@/services/announcementService'
import { trackPageVisit } from '@/services/visitorService'
import { CookieConsentBanner } from '@/components/compliance/CookieConsentBanner'
import OnlineMembersBubble from '@/components/knowledge/OnlineMembersBubble'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useGuideViewSession } from '@/hooks/useGuideViewSession'

// 需要隐藏 Footer 的路由模式
const HIDE_FOOTER_PATTERNS = [
  /^\/?(en|ru|zh)?\/knowledge(\/.*)?$/,  // 知识库所有页面
  /^\/?(en|ru|zh)?\/guide(\/.*)?$/,  // 扫码查阅入口
]

// 需要透明背景的路由（全屏沉浸式页面）
const TRANSPARENT_BG_PATTERNS = [
  /^\/?(en|ru|zh)?\/knowledge$/,  // 知识库入口页
  /^\/?(en|ru|zh)?\/guide$/,  // 扫码查阅入口
]

// 需要 main 区域透明的路由（包含 Hero Banner 的页面）
const TRANSPARENT_MAIN_PATTERNS = [
  /^\/?(en|ru|zh)?\/products$/,   // 产品中心
  /^\/?(en|ru|zh)?\/quality$/,    // 质量管理
  /^\/?(en|ru|zh)?\/about$/,      // 关于我们
]

const Layout: React.FC = () => {
  const { user } = useAuth()
  const { siteSettings, pagesEnabled } = useSiteSettings()
  const location = useLocation()
  const { isPublicGuide, ready: guideViewReady } = useGuideViewSession()
  const lastTrackedPath = useRef<string>('')

  // 公告状态
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [announcementHistory, setAnnouncementHistory] = useState<AnnouncementHistoryItem[]>([])

  // 根据用户角色、外部链接配置和页面启用状态过滤导航
  const userRoles = useMemo(() => user?.roles || [], [user?.roles])
  const navigationItems = useMemo(
    () => filterNavigationByRoles(
      getNavigationConfig(siteSettings.externalLinks, pagesEnabled),
      userRoles
    ),
    [userRoles, siteSettings.externalLinks, pagesEnabled]
  )

  // 判断是否隐藏 Footer
  const shouldHideFooter = useMemo(() => {
    return HIDE_FOOTER_PATTERNS.some(pattern => pattern.test(location.pathname))
  }, [location.pathname])

  // 判断是否使用透明背景
  const shouldTransparentBg = useMemo(() => {
    return TRANSPARENT_BG_PATTERNS.some(pattern => pattern.test(location.pathname))
  }, [location.pathname])

  // 判断 main 区域是否需要透明（包含 Hero Banner 的页面）
  const shouldTransparentMain = useMemo(() => {
    return TRANSPARENT_MAIN_PATTERNS.some(pattern => pattern.test(location.pathname))
  }, [location.pathname])

  const isKnowledgePage = /^\/?(en|ru|zh)?\/?(knowledge|guide)(?:\/|$)/.test(location.pathname)

  // 路由切换时立即重置滚动位置（禁用平滑滚动）
  useEffect(() => {
    const html = document.documentElement
    const originalBehavior = html.style.scrollBehavior
    html.style.scrollBehavior = 'auto'
    window.scrollTo(0, 0)
    html.style.scrollBehavior = originalBehavior
  }, [location.pathname])

  // 访问追踪 - 页面切换时记录访问
  useEffect(() => {
    const currentPath = location.pathname
    // 避免重复记录同一页面
    if (currentPath !== lastTrackedPath.current) {
      lastTrackedPath.current = currentPath
      // 异步记录访问，不阻塞页面渲染
      trackPageVisit(currentPath, document.referrer)
    }
  }, [location.pathname])

  // 加载当前公告和最近三个月的发布记录
  useEffect(() => {
    const loadAnnouncement = async () => {
      try {
        const contentLanguage = 'en'
        const otherLanguage = 'ru'

        const [data, history] = await Promise.all([
          getAnnouncement(contentLanguage),
          getAnnouncementHistory(contentLanguage),
        ])
        if (data?.enabled || history.length > 0) {
          setAnnouncement(data)
          setAnnouncementHistory(history)
          return
        }

        const [otherData, otherHistory] = await Promise.all([
          getAnnouncement(otherLanguage),
          getAnnouncementHistory(otherLanguage),
        ])
        setAnnouncement(otherData)
        setAnnouncementHistory(otherHistory)
      } catch (error) {
        console.error('Failed to load announcement:', error)
        setAnnouncement(null)
        setAnnouncementHistory([])
      }
    }
    loadAnnouncement()
  }, [location.pathname])

  // 透明背景模式下，动态移除所有容器背景
  useEffect(() => {
    if (shouldTransparentBg) {
      // 强制所有层级透明
      const style = document.createElement('style')
      style.id = 'knowledge-transparent-bg'
      style.textContent = `
        html:has(.knowledge-landing-bg),
        html:has(.knowledge-landing-bg) body,
        html:has(.knowledge-landing-bg) #root,
        html:has(.knowledge-landing-bg) .min-h-screen,
        html:has(.knowledge-landing-bg) main,
        html.dark:has(.knowledge-landing-bg),
        html.dark:has(.knowledge-landing-bg) body,
        html.dark:has(.knowledge-landing-bg) #root,
        html.dark:has(.knowledge-landing-bg) .min-h-screen,
        html.dark:has(.knowledge-landing-bg) main {
          background: transparent !important;
          background-color: transparent !important;
        }
      `
      document.head.appendChild(style)

      return () => {
        const existingStyle = document.getElementById('knowledge-transparent-bg')
        if (existingStyle) {existingStyle.remove()}
      }
    }
  }, [shouldTransparentBg])

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-300 ${shouldTransparentBg ? '' : 'bg-gray-50 dark:bg-slate-900'}`}
      style={shouldTransparentBg ? { background: 'transparent' } : undefined}
    >
      <CookieConsentBanner />
      {/* 顶部导航 */}
      <Header
        navigationItems={navigationItems}
        shouldTransparentBg={shouldTransparentBg}
        announcementControl={(announcement || announcementHistory.length > 0) ? (
          <AnnouncementBanner announcement={announcement} history={announcementHistory} />
        ) : undefined}
      />

      {/* 主内容区域 - pt-16 补偿 fixed header 高度 */}
      <main className={`flex-1 relative transition-colors duration-300 pt-16 ${shouldTransparentBg || shouldTransparentMain ? '' : 'bg-white dark:bg-slate-950'}`}>
        {isPublicGuide && !guideViewReady ? (
          <div className="min-h-[50vh] flex items-center justify-center"><LoadingSpinner /></div>
        ) : (
          <Outlet />
        )}

        {/* 页脚 - 部分页面隐藏 */}
        {!shouldHideFooter && <Footer />}
      </main>
      {isKnowledgePage && !isPublicGuide && <OnlineMembersBubble />}
    </div>
  )
}

export default Layout
