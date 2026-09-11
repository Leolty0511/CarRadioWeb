const assert = require('node:assert/strict')
const test = require('node:test')

const {
  formatForumEventNotification,
  parseForumEvent,
} = require('../dist/services/forumEventService.js')
const {
  settingsFromLegacy,
  shouldSendForumEvent,
} = require('../dist/services/forumNotificationService.js')
const { notificationService } = require('../dist/services/notificationService.js')

function encode(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

test('forum notifications retain a validated absolute action URL', () => {
  const event = parseForumEvent(encode({
    eventId: 'forum:post:42:1234567890',
    type: 'post_created',
    username: 'member',
    discussionTitle: 'CANBus setup',
    content: 'A new reply',
    url: 'https://forum.example.com/d/12/3',
    occurredAt: '2026-09-11T01:00:00.000Z',
  }), 'https://forum.example.com')

  const notification = formatForumEventNotification(event)
  assert.equal(notification.actionUrl, 'https://forum.example.com/d/12/3')
  assert.match(notification.content, /https:\/\/forum\.example\.com\/d\/12\/3/)
  assert.match(notification.markdown, /^> \*\*发帖人\*\*/)
  assert.match(notification.markdown, /#### 标题/)
  assert.match(notification.markdown, /\n---\n/)
  assert.doesNotMatch(notification.markdown, /https:\/\//)
})

test('forum registration notifications retain the legacy email detail', () => {
  const event = parseForumEvent(encode({
    eventId: 'forum:user:42:1234567890',
    type: 'user_registered',
    username: 'member',
    email: 'member@example.com',
    url: 'https://forum.example.com',
    occurredAt: '2026-09-11T01:00:00.000Z',
  }), 'https://forum.example.com')

  const notification = formatForumEventNotification(event, { locale: 'zh-hans' })
  assert.match(notification.title, /新用户注册/)
  assert.match(notification.content, /member@example\.com/)
  assert.match(notification.markdown, /member@example\\\.com/)
})

test('forum event links cannot leave the configured forum origin', () => {
  assert.throws(() => parseForumEvent(encode({
    eventId: 'forum:discussion:42:1234567890',
    type: 'discussion_started',
    username: 'member',
    url: 'https://attacker.example/d/42',
    occurredAt: '2026-09-11T01:00:00.000Z',
  }), 'https://forum.example.com'), /invalid_event_url/)
})

test('legacy Notify Push settings migrate into independent forum channels', () => {
  const settings = settingsFromLegacy({
    'leo-t-notify-push.push_locale': 'en',
    'leo-t-notify-push.push_timezone': 'America/New_York',
    'leo-t-notify-push.skip_admin_mod': '1',
    'leo-t-notify-push.wecom_enabled': '1',
    'leo-t-notify-push.wecom_webhook_url': 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test',
    'leo-t-notify-push.dingtalk_enabled': '1',
    'leo-t-notify-push.dingtalk_webhook_url': 'https://oapi.dingtalk.com/robot/send?access_token=test',
    'leo-t-notify-push.dingtalk_secret': 'SEC-test',
    'leo-t-notify-push.serverchan_enabled': '1',
    'leo-t-notify-push.serverchan_send_key': 'SCT-test',
    'leo-t-notify-push.email_enabled': '1',
    'leo-t-notify-push.email_recipients': 'admin@example.com',
    'leo-t-notify-push.webhook_enabled': '1',
    'leo-t-notify-push.webhook_url': 'https://hooks.example.com/forum',
    'leo-t-notify-push.webhook_method': 'PUT',
    'leo-t-notify-push.webhook_headers': 'Authorization: Bearer test',
    mail_host: 'smtp.example.com',
    mail_port: '465',
    mail_encryption: 'ssl',
    mail_username: 'forum@example.com',
    mail_password: 'secret',
    mail_from: 'forum@example.com',
  })

  assert.equal(settings.enabled, true)
  assert.equal(settings.locale, 'en')
  assert.equal(settings.skipAdminMod, true)
  assert.equal(settings.channels.wecom.enabled, true)
  assert.equal(settings.channels.dingtalk.secret, 'SEC-test')
  assert.equal(settings.channels.serverchan.sendKey, 'SCT-test')
  assert.equal(settings.channels.email.host, 'smtp.example.com')
  assert.equal(settings.channels.email.secure, true)
  assert.equal(settings.channels.webhook.method, 'PUT')
  assert.equal(settings.channels.webhook.headers, 'Authorization: Bearer test')
})

test('admin and moderator filter skips posts but not registrations', () => {
  const settings = settingsFromLegacy({
    'leo-t-notify-push.skip_admin_mod': '1',
    'leo-t-notify-push.wecom_enabled': '1',
    'leo-t-notify-push.wecom_webhook_url': 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test',
  })
  const common = { eventId: 'forum:test:123456', username: 'admin', occurredAt: '2026-09-11T01:00:00.000Z', isPrivileged: true }
  assert.equal(shouldSendForumEvent(settings, { ...common, type: 'discussion_started' }), false)
  assert.equal(shouldSendForumEvent(settings, { ...common, type: 'post_created' }), false)
  assert.equal(shouldSendForumEvent(settings, { ...common, type: 'user_registered' }), true)
})

test('main notification channels receive a clickable forum action', async () => {
  const originalFetch = global.fetch
  const requests = []
  global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body))
    return { ok: true, json: async () => requests.length === 1 ? { errcode: 0 } : { code: 0 } }
  }
  try {
    const payload = {
      title: '论坛新回复',
      content: '测试内容',
      markdown: '**内容：** 测试内容',
      actionUrl: 'https://forum.example.com/d/12/3',
      actionLabel: '查看详情',
    }
    assert.equal((await notificationService.sendChannel('wecom', { enabled: true, webhook: 'https://qyapi.weixin.qq.com/test' }, payload)).success, true)
    assert.equal((await notificationService.sendChannel('feishu', { enabled: true, webhook: 'https://open.feishu.cn/test' }, payload)).success, true)
    assert.match(requests[0].markdown.content, /\[🔗 查看详情\]\(https:\/\/forum\.example\.com\/d\/12\/3\)/)
    assert.equal(requests[1].card.elements[1].actions[0].url, 'https://forum.example.com/d/12/3')
  } finally {
    global.fetch = originalFetch
  }
})

test('DingTalk does not append an invalid signature when the optional secret is empty', async () => {
  const originalFetch = global.fetch
  let requestUrl = ''
  global.fetch = async (url) => {
    requestUrl = String(url)
    return { ok: true, json: async () => ({ errcode: 0 }) }
  }
  try {
    const result = await notificationService.sendChannel('dingtalk', {
      enabled: true,
      webhook: 'https://oapi.dingtalk.com/robot/send?access_token=test',
      secret: '',
    }, { title: '测试', content: '测试内容', markdown: '**测试**' })
    assert.equal(result.success, true)
    assert.equal(requestUrl, 'https://oapi.dingtalk.com/robot/send?access_token=test')
  } finally {
    global.fetch = originalFetch
  }
})
