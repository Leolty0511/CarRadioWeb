import React, { useState, useRef, useEffect } from 'react'
import { Send } from 'lucide-react'
import { useAITranslation } from '@/hooks/useAITranslation'

interface ChatInputProps {
  onSendMessage: (message: string) => void
  disabled?: boolean
  placeholder?: string
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  disabled = false,
  placeholder
}) => {
  const { t } = useAITranslation()
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 自动调整输入框高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [message])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim() && !disabled) {
      onSendMessage(message.trim())
      setMessage('')
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="border-t border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/95 p-3">
      <form onSubmit={handleSubmit} className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 shadow-sm focus-within:border-blue-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800 dark:focus-within:border-blue-500/60">
        {/* 输入框 */}
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={placeholder || t('ai.inputPlaceholder')}
            disabled={disabled}
            rows={1}
            className="block w-full max-h-32 resize-none border-0 bg-transparent px-3 py-2 text-sm leading-6 text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500 scrollbar-none"
          />
        </div>

        {/* 发送按钮 */}
        <button
          type="submit"
          disabled={!message.trim() || disabled}
          className={`flex-shrink-0 h-10 w-10 inline-flex items-center justify-center rounded-xl transition-all duration-200 touch-manipulation ${
            message.trim() && !disabled
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
              : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
          }`}
          title={t('ai.sendMessage')}
        >
          <Send className="h-5 w-5" />
        </button>
      </form>

    </div>
  )
}

export default ChatInput
