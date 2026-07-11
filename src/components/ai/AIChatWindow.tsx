import React, { useRef, useEffect } from 'react'
import { Bot, RotateCcw, Sparkles, X } from 'lucide-react'
import ChatMessage, { ChatMessageData } from './ChatMessage'
import ChatInput from './ChatInput'
import { useAITranslation } from '@/hooks/useAITranslation'

interface AIChatWindowProps {
  isOpen: boolean
  onClose: () => void
  messages: ChatMessageData[]
  onSendMessage: (message: string) => void
  onClearChat: () => void
  isLoading?: boolean
  status?: 'online' | 'offline'
}

const AIChatWindow: React.FC<AIChatWindowProps> = ({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  onClearChat,
  isLoading = false,
  status = 'offline'
}) => {
  const { t } = useAITranslation()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // 自动滚动到最新消息
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleSourceClick = (source: any) => {
    // 根据来源类型跳转到对应页面
    if (source.id) {
      const url = `/knowledge?doc=${source.id}`
      // 在新标签页打开文档
      window.open(url, '_blank')
    } else {
      console.warn('Source missing ID:', source)
    }
  }

  if (!isOpen) {return null}

  const quickQuestions = [
    t('ai.quickQuestions.compatibility'),
    t('ai.quickQuestions.installation'),
    t('ai.quickQuestions.troubleshooting'),
  ]
  const isOnline = status === 'online'

  return (
    <>
    <button
      type="button"
      aria-label={t('ai.close')}
      onClick={onClose}
      className="fixed inset-0 z-[55] bg-slate-950/25 backdrop-blur-[1px] sm:hidden"
    />
    <div className="fixed left-3 right-3 top-16 bottom-3 sm:left-auto sm:top-auto sm:right-6 sm:bottom-6 sm:w-[460px] md:w-[500px] sm:h-[min(760px,calc(100vh-7rem))] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-[0_24px_80px_rgba(15,23,42,0.24)] border border-slate-200/80 dark:border-slate-700/80 flex flex-col overflow-hidden z-[60] animate-in slide-in-from-bottom-4 duration-300 ai-chat-window">
      {/* 头部 */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200/80 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/90 text-slate-900 dark:text-white">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-10 w-10 flex-shrink-0 rounded-xl bg-blue-600 text-white shadow-sm flex items-center justify-center">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm sm:text-base font-semibold">{t('ai.title')}</h3>
              <span className={`hidden sm:inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                isOnline
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                {isOnline ? t('ai.status.online') : t('ai.status.offline')}
              </span>
            </div>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400 hidden sm:block">{t('ai.subtitle')}</p>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          {/* 清空聊天 */}
          <button
            type="button"
            onClick={onClearChat}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors duration-200 touch-manipulation"
            title={t('ai.clearChat')}
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          {/* 关闭 */}
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors duration-200 touch-manipulation"
            title={t('ai.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 消息区域 */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 space-y-4 bg-slate-50/90 dark:bg-slate-950/40"
      >
        {messages.length === 0 ? (
          <div className="min-h-full flex items-center justify-center px-2 py-6 text-center text-slate-500 dark:text-slate-400">
            <div className="w-full max-w-sm">
              <div className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <Sparkles className="h-6 w-6" />
              </div>
              <h4 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">{t('ai.welcome.title')}</h4>
              <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">{t('ai.welcome.subtitle')}</p>
              <div className="mt-5 grid gap-2">
                {quickQuestions.map(question => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => onSendMessage(question)}
                    disabled={isLoading}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500/40 dark:hover:bg-blue-500/10 dark:hover:text-blue-200"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                onSourceClick={handleSourceClick}
              />
            ))}
          </>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <ChatInput
        onSendMessage={onSendMessage}
        disabled={isLoading}
        placeholder={isLoading ? t('ai.processing') : undefined}
      />
    </div>
    </>
  )
}

export default AIChatWindow
