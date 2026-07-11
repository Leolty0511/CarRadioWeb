import { cn } from '@/utils/cn'

export interface SpinnerProps {
  /** Tailwind 尺寸类，默认 h-4 w-4 */
  className?: string
}

/**
 * 按钮内加载指示器（旋转圆环）
 * 供 Button / ECommerceButton 等共享，避免在每个按钮组件里复制粘贴 SVG。
 */
export const Spinner: React.FC<SpinnerProps> = ({ className }) => (
  <svg
    className={cn('animate-spin -ml-1 mr-2 h-4 w-4', className)}
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
)
