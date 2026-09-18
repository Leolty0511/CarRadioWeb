const assert = require('node:assert/strict')
const test = require('node:test')
const {
  clampUpdateMemoryLimitMb,
  formatMemoryMb,
  parseLinuxMeminfo,
} = require('../dist/utils/updateResourceSafety.js')

test('parses Linux available memory and swap values in bytes', () => {
  const snapshot = parseLinuxMeminfo([
    'MemTotal:        1638400 kB',
    'MemFree:           86924 kB',
    'MemAvailable:     250492 kB',
    'SwapTotal:       2097148 kB',
    'SwapFree:        2097148 kB',
  ].join('\n'))

  assert.deepEqual(snapshot, {
    totalBytes: 1638400 * 1024,
    availableBytes: 250492 * 1024,
    swapTotalBytes: 2097148 * 1024,
    swapFreeBytes: 2097148 * 1024,
  })
  assert.equal(formatMemoryMb(snapshot.availableBytes), 245)
})

test('rejects incomplete meminfo instead of assuming memory capacity', () => {
  assert.equal(parseLinuxMeminfo('MemTotal: 1638400 kB\n'), null)
  assert.equal(parseLinuxMeminfo('not meminfo'), null)
})

test('uses a bounded configurable updater memory value', () => {
  assert.equal(clampUpdateMemoryLimitMb(undefined, 384, 128, 4096), 384)
  assert.equal(clampUpdateMemoryLimitMb('64', 384, 128, 4096), 128)
  assert.equal(clampUpdateMemoryLimitMb('512', 384, 128, 4096), 512)
  assert.equal(clampUpdateMemoryLimitMb('9999', 384, 128, 4096), 4096)
  assert.equal(clampUpdateMemoryLimitMb('invalid', 384, 128, 4096), 384)
})
