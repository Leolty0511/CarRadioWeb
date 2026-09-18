const assert = require('node:assert/strict')
const test = require('node:test')

const {
  parseQrLinkHubInput,
  qrTokenSchema,
} = require('../dist/utils/qrLinkHubValidation.js')

const validInput = {
  name: 'Ford Focus resources',
  title: 'Installation resources',
  description: 'Choose a resource',
  enabled: true,
  links: [{
    label: 'Installation video',
    description: '',
    url: 'https://drive.google.com/file/d/example/view',
    type: 'video',
    enabled: true,
    order: 0,
  }],
}

test('accepts a bounded QR link hub with HTTPS destinations', () => {
  const parsed = parseQrLinkHubInput(validInput)
  assert.equal(parsed.links[0].type, 'video')
  assert.equal(parsed.links[0].url, validInput.links[0].url)
})

test('rejects executable and non-web destination schemes', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/manual.pdf']) {
    assert.throws(() => parseQrLinkHubInput({
      ...validInput,
      links: [{ ...validInput.links[0], url }],
    }))
  }
})

test('limits each QR page to 20 links and validates public tokens', () => {
  assert.throws(() => parseQrLinkHubInput({
    ...validInput,
    links: Array.from({ length: 21 }, (_, order) => ({ ...validInput.links[0], order })),
  }))
  assert.equal(qrTokenSchema.safeParse('aB3_-xY9pQ2k').success, true)
  assert.equal(qrTokenSchema.safeParse('../admin').success, false)
})
