import User from '../models/User'
import AdminInvitation from '../models/AdminInvitation'
import { createLogger } from '../utils/logger'

const logger = createLogger('admin-index-service')

function hasSamePartialFilter(actual: unknown, expected: Record<string, unknown>): boolean {
  return JSON.stringify(actual ?? null) === JSON.stringify(expected)
}

async function ensureUserRoleIndex(): Promise<void> {
  const collection = User.collection
  const indexes = await collection.indexes()
  const roleIndex = indexes.find((idx) => idx.name === 'role_1')
  const expectedPartial = { role: 'super_admin' }

  if (
    roleIndex &&
    roleIndex.name &&
    (!roleIndex.unique || !hasSamePartialFilter(roleIndex.partialFilterExpression, expectedPartial))
  ) {
    await collection.dropIndex(roleIndex.name)
    logger.info('Dropped outdated User role_1 index')
  }

  await collection.createIndex(
    { role: 1 },
    {
      name: 'role_1',
      unique: true,
      partialFilterExpression: expectedPartial,
    }
  )
}

async function ensureInvitationEmailIndex(): Promise<void> {
  const collection = AdminInvitation.collection
  await revokeDuplicateActiveInvitations()

  const indexes = await collection.indexes()
  const emailIndex = indexes.find((idx) => idx.name === 'email_1')
  const expectedPartial = { acceptedAt: null, revokedAt: null }

  if (
    emailIndex &&
    emailIndex.name &&
    (!emailIndex.unique || !hasSamePartialFilter(emailIndex.partialFilterExpression, expectedPartial))
  ) {
    await collection.dropIndex(emailIndex.name)
    logger.info('Dropped outdated AdminInvitation email_1 index')
  }

  await collection.createIndex(
    { email: 1 },
    {
      name: 'email_1',
      unique: true,
      partialFilterExpression: expectedPartial,
    }
  )
}

async function revokeDuplicateActiveInvitations(): Promise<void> {
  const invitations = await AdminInvitation.find({
    acceptedAt: null,
    revokedAt: null,
  })
    .sort({ createdAt: -1 })
    .select('_id email')
    .lean()

  const seenEmails = new Set<string>()
  const duplicateIds = []

  for (const invitation of invitations) {
    if (seenEmails.has(invitation.email)) {
      duplicateIds.push(invitation._id)
    } else {
      seenEmails.add(invitation.email)
    }
  }

  if (duplicateIds.length > 0) {
    await AdminInvitation.updateMany(
      { _id: { $in: duplicateIds } },
      { $set: { revokedAt: new Date() } }
    )
    logger.info({ count: duplicateIds.length }, 'Revoked duplicate active admin invitations')
  }
}

export async function ensureAdminIndexes(): Promise<void> {
  await ensureUserRoleIndex()
  await ensureInvitationEmailIndex()
}
