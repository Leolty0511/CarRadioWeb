import bcrypt from 'bcryptjs'
import User from '../models/User'
import { createLogger } from '../utils/logger'
import { isDuplicateKeyError } from '../utils/mongoErrors'

const logger = createLogger('default-admin-service')

export const DEFAULT_ADMIN_USERNAME = 'admin'
export const DEFAULT_ADMIN_PASSWORD = 'admin'
const BCRYPT_ROUNDS = 12

/** Create the well-known first-login account only when no super administrator exists. */
export async function ensureDefaultAdmin(): Promise<boolean> {
  if (await User.exists({ role: 'super_admin' })) {return false}

  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, BCRYPT_ROUNDS)
  const mustChangeCredentials = process.env.NODE_ENV === 'production'

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
