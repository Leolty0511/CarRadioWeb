import React from 'react'
import Modal from '@/components/ui/Modal'

interface ReferenceImageModalProps {
  isOpen: boolean
  onClose: () => void
  imageUrl: string
  title: string
  description?: string
  altText?: string
}

/**
 * 用于 CANBox 和主机型号参考图的普通弹窗。
 * 与全屏图片查看器不同，这里保留页面上下文，并让图片在弹窗内自适应显示。
 */
const ReferenceImageModal: React.FC<ReferenceImageModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  title,
  description,
  altText,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={title}
    size="xl"
    className="max-w-5xl"
    overlayClassName="bg-slate-900/20 backdrop-blur-[2px] dark:bg-black/35"
  >
    <div className="space-y-4">
      <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-gray-700 dark:bg-gray-900/70">
        <img
          src={imageUrl}
          alt={altText || title}
          className="max-h-[65vh] w-auto max-w-full rounded-lg object-contain"
        />
      </div>
      {description?.trim() && (
        <p className="whitespace-pre-wrap text-sm leading-7 text-slate-600 dark:text-gray-300">
          {description}
        </p>
      )}
    </div>
  </Modal>
)

export default ReferenceImageModal
