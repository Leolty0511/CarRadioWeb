import {
  formatForumEventNotification,
  forumNotificationEventType,
  shouldSendForumEvent,
  type ForumEventPayload,
} from './forumEventService'
import { notificationService } from './notificationService'
import { createLogger } from '../utils/logger'

const logger = createLogger('forum-notification')
const MAX_PENDING_EVENTS = 100
const MAX_CONCURRENT_EVENTS = 2

class ForumNotificationService {
  private readonly pendingEvents: ForumEventPayload[] = []
  private activeEvents = 0

  enqueue(event: ForumEventPayload): boolean {
    if (this.pendingEvents.length >= MAX_PENDING_EVENTS) {
      logger.warn({ eventId: event.eventId, pending: this.pendingEvents.length }, 'Forum notification queue is full; event dropped')
      return false
    }
    this.pendingEvents.push(event)
    setImmediate(() => this.drainQueue())
    return true
  }

  private drainQueue(): void {
    while (this.activeEvents < MAX_CONCURRENT_EVENTS && this.pendingEvents.length > 0) {
      const event = this.pendingEvents.shift()
      if (!event) return
      this.activeEvents += 1
      void this.notify(event)
        .catch((error) => logger.error({ error, eventId: event.eventId }, 'Forum event notification failed'))
        .finally(() => {
          this.activeEvents -= 1
          this.drainQueue()
        })
    }
  }

  async notify(event: ForumEventPayload): Promise<void> {
    const settings = await notificationService.getEventSettings()
    if (!shouldSendForumEvent(settings, event)) return
    await notificationService.notifyEvent(forumNotificationEventType(event.type), {
      ...formatForumEventNotification(event),
      actionLabel: '查看详情',
      timestamp: event.occurredAt,
    })
  }
}

export const forumNotificationService = new ForumNotificationService()
