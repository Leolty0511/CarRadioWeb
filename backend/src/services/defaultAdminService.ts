import bcrypt from 'bcryptjs'
import User from '../models/User'
import { createLogger } from '../utils/logger'
import { isDuplicateKeyError } from '../utils/mongoErrors'

const logger = createLogger('default-admin-service')

export const DEFAULT_ADMIN_USERNAME = 'admin'
export const DEFAULT_ADMIN_PASSWORD = 'admin'
const BCRYPT_ROUNDS = 12

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

async function createDefaultAdmin(mustChangeCredentials: boolean): Promise<boolean> {
  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, BCRYPT_ROUNDS)

  try {
    await User.create({
      email: null,
      loginUsername: DEFAULT_ADMIN_USERNAME,
      nickname: DEFAULT_ADMIN_USERNAME,
      avatar: '',
      role: 'super_admin',
      provider: 'email',
      providerId: `local_${DEFAULT_ADMIN_USERNAME}`,
      passwordHash,
      permissions: [],
      isActive: true,
      mustChangeCredentials,
      lastLoginAt: null,
    })
  } catch (error) {
    if (isDuplicateKeyError(error) && await User.exists({ role: 'super_admin' })) {
      return false
    }
    throw error
  }

  logger.warn(
    { mustChangeCredentials },
    mustChangeCredentials
      ? 'Default admin account created; credentials must be changed after first login'
      : 'Development default admin account created'
  )
  return true
}

/** Local development only: keep the well-known admin/admin login without touching production. */
async function ensureLocalDevAdmin(): Promise<boolean> {
  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, BCRYPT_ROUNDS)
  const existing = await User.findOne({ loginUsername: DEFAULT_ADMIN_USERNAME }).select('+passwordHash')

  if (existing) {
    existing.role = 'super_admin'
    existing.isActive = true
    existing.passwordHash = passwordHash
    existing.mustChangeCredentials = false
    if (!existing.providerId) {
      existing.providerId = `local_${DEFAULT_ADMIN_USERNAME}`
    }
    await existing.save()
    logger.info('Development admin password reset to the local default')
    return true
  }

  return createDefaultAdmin(false)
}

/** Create the well-known first-login account only when no super administrator exists. */
export async function ensureDefaultAdmin(): Promise<boolean> {
  if (!isProduction()) {
    return ensureLocalDevAdmin()
  }

  if (await User.exists({ role: 'super_admin' })) {return false}
  return createDefaultAdmin(true)
}
