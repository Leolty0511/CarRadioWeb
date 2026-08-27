import React from 'react'
import { cn } from '@/utils/cn'
import { type FilterChipItem } from '@/utils/knowledgeCategoryChips'

export type { FilterChipItem }

interface FilterChipBarProps {
  items: FilterChipItem[]
  selectedId: string
  onSelect: (id: string) => void
  label?: string
  ariaLabel?: string
  className?: string
}

const FilterChipBar: React.FC<FilterChipBarProps> = ({
  items,
  selectedId,
  onSelect,
  label,
  ariaLabel,
  className = ''
}) => {
  if (items.length === 0) {
    return null
  }

  return (
    <div className={cn('min-w-0', className)}>
      {label ? (
        <p className="mb-2 text-sm font-medium text-slate-700 dark:text-gray-300">
          {label}
        </p>
      ) : null}
      <div
        role="listbox"
        aria-label={ariaLabel || label}
        aria-orientation="horizontal"
        className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => {
          const selected = item.id === selectedId
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(item.id)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-sm transition',
                selected
                  ? 'border-cyan-600 bg-cyan-600 text-white dark:border-cyan-500 dark:bg-cyan-500'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-cyan-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-cyan-600'
              )}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default FilterChipBar
