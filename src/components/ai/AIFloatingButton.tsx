import React from 'react'
import { Bot, MessageCircle, Sparkles, X, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DotLottieReact } from '@lottiefiles/dotlottie-react'
import { useTheme } from '@/contexts/ThemeContext'

interface AIFloatingButtonProps {
  isOpen: boolean
  onClick: () => void
  hasUnread?: boolean
}

// Lottie animation paths for different themes
const ROBOT_ANIMATION_DARK = '/animations/ai ai.json'
const ROBOT_ANIMATION_LIGHT = '/animations/ai-light.json'

const AIFloatingButton: React.FC<AIFloatingButtonProps> = ({
  isOpen,
  onClick,
  hasUnread = false
}) => {
  const { isDark } = useTheme()
  const animationPath = isDark ? ROBOT_ANIMATION_DARK : ROBOT_ANIMATION_LIGHT
  const [styleIndex, setStyleIndex] = useState(0)

  // Rotate presentation styles slowly so the assistant feels alive without
  // changing its interaction or requiring another settings surface.
  useEffect(() => {
    if (isOpen) return
    const timer = window.setInterval(() => setStyleIndex((value) => (value + 1) % 4), 18000)
    return () => window.clearInterval(timer)
  }, [isOpen])

  const handleClick = () => {
    onClick()
  }

  return (
    <button
      onClick={handleClick}
      className={`
        fixed bottom-24 right-4 sm:bottom-28 sm:right-6
        w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24
        transition-all duration-500 ease-out
        flex items-center justify-center z-50 touch-manipulation
        outline-none focus:outline-none focus:ring-0 select-none
        ${isOpen ? 'scale-0 opacity-0 pointer-events-none' : 'scale-100 opacity-100'}
        hover:scale-110 active:scale-95
      `}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {/* 未读消息指示器 */}
      {hasUnread && !isOpen && (
        <div className="absolute top-0 right-0 w-4 h-4 z-10">
          <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-75" />
          <div className="absolute inset-0 bg-red-500 rounded-full" />
        </div>
      )}

      {/* Multiple visual treatments share one button and preserve the same action. */}
      <div className={`relative w-full h-full transition-all duration-500 ${isOpen ? 'opacity-0 scale-0' : 'opacity-100 scale-100'}`}>
        {styleIndex === 0 && (
          <DotLottieReact
            key={`robot-animation-${isDark ? 'dark' : 'light'}`}
            src={animationPath}
            loop
            autoplay
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        )}
        {styleIndex === 1 && (
          <div className="absolute inset-1 rounded-full bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 p-1 shadow-[0_10px_35px_rgba(37,99,235,0.45)] animate-[spin_12s_linear_infinite]">
            <div className="w-full h-full rounded-full bg-slate-950/90 flex items-center justify-center">
              <Bot className="w-10 h-10 sm:w-12 sm:h-12 text-cyan-300 drop-shadow-[0_0_12px_rgba(103,232,249,0.9)]" />
            </div>
          </div>
        )}
        {styleIndex === 2 && (
          <div className="absolute inset-2 rounded-[28%] bg-white/90 dark:bg-slate-800/95 border border-amber-300/70 dark:border-amber-500/50 shadow-[0_12px_30px_rgba(245,158,11,0.3)] rotate-3 flex items-center justify-center">
            <MessageCircle className="w-9 h-9 sm:w-11 sm:h-11 text-amber-500" />
            <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-emerald-400 ring-4 ring-white dark:ring-slate-800" />
          </div>
        )}
        {styleIndex === 3 && (
          <div className="absolute inset-1 rounded-full bg-gradient-to-br from-fuchsia-500 via-violet-600 to-slate-900 shadow-[0_10px_35px_rgba(139,92,246,0.45)] flex items-center justify-center animate-pulse">
            <div className="absolute inset-2 rounded-full border border-white/35" />
            <Sparkles className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
            <Zap className="absolute bottom-3 right-3 w-4 h-4 text-yellow-300" />
          </div>
        )}
      </div>

      {/* 关闭图标 - 打开时显示 */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`}
      >
        <div className="w-12 h-12 flex items-center justify-center bg-gray-800/80 rounded-full">
          <X className="h-6 w-6 text-white drop-shadow-lg" />
        </div>
      </div>
    </button>
  )
}

export default AIFloatingButton
