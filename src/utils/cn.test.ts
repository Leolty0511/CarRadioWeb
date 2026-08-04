import { describe, it, expect } from 'vitest'
import { cn } from './cn'

/**
 * cn() 工具函数的冒烟测试
 * 既作为该函数的回归测试，也确保 `npm run test:run` 有可执行用例，
 * 不再依赖 CI 的 continue-on-error 掩盖「no tests found」。
 */
describe('cn', () => {
  it('合并多个类名', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('过滤假值（undefined / null / false）', () => {
    expect(cn('keep', false, undefined, null, 'tail')).toBe('keep tail')
  })

  it('用 tailwind-merge 解决冲突类（后者胜出）', () => {
    // p-1 与 p-2 冲突，twMerge 保留 p-2
    expect(cn('p-1', 'p-2')).toBe('p-2')
  })

  it('支持对象与数组形式的条件类', () => {
    expect(cn({ active: true, hidden: false }, ['a', 'b'])).toBe('active a b')
  })

  it('无入参时返回空字符串', () => {
    expect(cn()).toBe('')
  })
})
