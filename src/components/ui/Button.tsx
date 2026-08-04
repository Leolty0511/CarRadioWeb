import React from 'react'
import { cn } from '@/utils/cn'
import { Spinner } from './Spinner'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'glass' | 'gradient' | 'neomorphism'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  loading?: boolean
  children: React.ReactNode
  glow?: boolean
  ripple?: boolean
  shimmer?: boolean
}

/**
 * 现代化按钮组件 - 基于UI/UX Pro Max设计原则
 * 支持多种现代设计风格和微交互
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    variant = 'primary',
    size = 'md',
    loading = false,
    children,
    className,
    disabled,
    glow = false,
    ripple = false,
    shimmer = false,
    ...props
  }, ref) => {
    const baseClasses = 'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none relative overflow-hidden'

    const variants = {
      primary: 'bg-theme-secondary text-white hover:bg-blue-600 shadow-lg hover:shadow-xl focus-visible:ring-theme-secondary hover:-translate-y-0.5',
      secondary: 'bg-theme text-white hover:bg-slate-700 shadow-lg hover:shadow-xl focus-visible:ring-theme hover:-translate-y-0.5',
      outline: 'border-2 border-theme-secondary bg-transparent text-theme-secondary hover:bg-theme-secondary hover:text-white hover:shadow-lg focus-visible:ring-theme-secondary',
      ghost: 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus-visible:ring-gray-500',
      destructive: 'bg-red-600 text-white hover:bg-red-700 shadow-lg hover:shadow-xl focus-visible:ring-red-500 hover:-translate-y-0.5',
      glass: 'glass-effect text-white hover:bg-white/20 shadow-lg hover:shadow-xl focus-visible:ring-white/50 backdrop-blur-md',
      gradient: 'bg-gradient-to-r from-theme-secondary to-theme text-white hover:from-blue-600 hover:to-slate-700 shadow-lg hover:shadow-xl focus-visible:ring-theme-secondary hover:-translate-y-0.5',
      neomorphism: 'neomorphism text-gray-800 dark:text-gray-200 focus-visible:ring-gray-500'
    }

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-base',
      lg: 'px-6 py-3 text-lg',
      xl: 'px-8 py-4 text-xl'
    }

    const glowClasses = glow ? {
      primary: 'btn-glow-primary',
      secondary: 'btn-glow-primary',
      gradient: 'btn-glow-primary',
      destructive: 'glow-secondary',
      glass: 'btn-glow-primary',
      outline: '',
      ghost: '',
      neomorphism: ''
    } : {}

    const effectClasses = cn(
      ripple && 'btn-ripple',
      shimmer && 'btn-shimmer'
    )

    return (
      <button
        ref={ref}
        className={cn(
          baseClasses,
          variants[variant],
          sizes[size],
          glow && glowClasses[variant],
          effectClasses,
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Spinner />}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export { Button }