import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/utils/cn'
import { X } from 'lucide-react'

// 用于生成唯一的 aria 关联 id
let modalTitleCounter = 0

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  variant?: 'default' | 'glass' | 'neomorphism'
  closeOnOverlayClick?: boolean
  closeOnEscape?: boolean
  showCloseButton?: boolean
  className?: string
}

/**
 * 现代化模态框组件 - 基于UI/UX Pro Max设计原则
 * 支持玻璃态效果、新拟态、多种尺寸和动画
 */
const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  title,
  size = 'md',
  variant = 'default',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  className
}) => {
  // 每个 Modal 实例拥有稳定的 aria 关联 id
  const titleIdRef = useRef<string>(`modal-title-${++modalTitleCounter}`)
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  // Keep the latest callback without making the keyboard/focus effect restart
  // every time a parent renders a new inline onClose handler.
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // ESC键关闭 + 打开时聚焦对话框，让屏幕阅读器/键盘用户进入对话框
  useEffect(() => {
    if (!closeOnEscape) {return}

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
      // 移动焦点到对话框本身，便于后续键盘导航
      // 微小延迟确保 DOM 已挂载
      const focusTimer = setTimeout(() => dialogRef.current?.focus(), 0)
      return () => {
        clearTimeout(focusTimer)
        document.removeEventListener('keydown', handleEscape)
        document.body.style.overflow = 'unset'
      }
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, closeOnEscape])

  if (!isOpen) {return null}

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-[95vw] max-h-[95vh]'
  }

  const variants = {
    default: 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-2xl',
    glass: 'glass-effect-strong',
    neomorphism: 'neomorphism'
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose()
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 z-0 bg-black/50 backdrop-blur-sm animate-fade-in-smooth"
        onClick={handleOverlayClick}
        aria-hidden
      />

      {/* 模态框内容：min-h-0 + overflow-hidden 避免 flex 子项撑破 max-h，内容溢出「白框」外 */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleIdRef.current : undefined}
        aria-label={title ? undefined : 'Dialog'}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex w-full min-h-0 flex-col overflow-hidden rounded-2xl animate-scale-in-smooth shadow-2xl outline-none',
          size === 'full' ? 'h-[95vh]' : 'max-h-[90vh]',
          sizes[size],
          variants[variant],
          className
        )}
      >
        {/* 头部 */}
        {(title || showCloseButton) && (
          <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 p-6 dark:border-gray-700">
            {title && (
              <h2 id={titleIdRef.current} className="text-xl font-semibold text-gray-900 dark:text-white pr-4">
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="ml-auto shrink-0 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* 内容区：可滚动 + 默认内边距 */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-6">{children}</div>
      </div>
    </div>,
    document.body
  )
}

export default Modal
