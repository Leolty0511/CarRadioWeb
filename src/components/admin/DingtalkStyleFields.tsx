import { AlignLeft, Image, MousePointerClick } from 'lucide-react'
import { Input } from '@/components/ui/Input'

export type DingtalkMessageStyle = 'markdown' | 'actionCard' | 'link'

interface DingtalkStyleFieldsProps {
  messageStyle?: unknown
  imageUrl?: unknown
  onChange: (patch: { messageStyle?: DingtalkMessageStyle; imageUrl?: string }) => void
}

const STYLES: Array<{
  value: DingtalkMessageStyle
  label: string
  description: string
  icon: typeof AlignLeft
}> = [
  { value: 'markdown', label: '经典 Markdown', description: '保留当前分区排版和正文详情链接', icon: AlignLeft },
  { value: 'actionCard', label: '操作卡片', description: '品牌头图、完整正文和原生详情按钮', icon: MousePointerClick },
  { value: 'link', label: '图文摘要', description: '紧凑缩略图和摘要，点击整张消息查看', icon: Image },
]

function normalizeStyle(value: unknown): DingtalkMessageStyle {
  return value === 'actionCard' || value === 'link' ? value : 'markdown'
}

export function DingtalkStyleFields({ messageStyle, imageUrl, onChange }: DingtalkStyleFieldsProps) {
  const style = normalizeStyle(messageStyle)
  const imageLabel = style === 'actionCard' ? '品牌头图 URL' : '摘要缩略图 URL'

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <span className="block text-sm font-medium text-slate-700 dark:text-gray-300">推送样式</span>
        <div role="radiogroup" aria-label="钉钉推送样式" className="grid gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-900/50 md:grid-cols-3">
          {STYLES.map((option) => {
            const Icon = option.icon
            const selected = style === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange({ messageStyle: option.value })}
                className={`min-h-20 rounded-md border px-3 py-2 text-left transition-colors ${selected
                  ? 'border-blue-500 bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300'
                  : 'border-transparent text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                <span className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 flex-shrink-0" />{option.label}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">{option.description}</span>
              </button>
            )
          })}
        </div>
      </div>

      {style !== 'markdown' && (
        <label className="block space-y-2 text-sm font-medium text-slate-700 dark:text-gray-300">
          <span>{imageLabel}</span>
          <Input
            type="url"
            value={typeof imageUrl === 'string' ? imageUrl : ''}
            onChange={(event) => onChange({ imageUrl: event.target.value })}
            placeholder="https://example.com/brand-image.png"
          />
          <span className="block text-xs font-normal leading-5 text-slate-500 dark:text-slate-400">
            可留空；填写可公开访问的 HTTP(S) JPG 或 PNG 地址，避免使用需要登录或有时效签名的图片。
          </span>
        </label>
      )}
    </div>
  )
}
