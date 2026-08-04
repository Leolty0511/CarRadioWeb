/**
 * MongoDB 错误类型守卫
 * 为 catch (error: unknown) 提供类型安全的 duplicate key 判断，
 * 替代各处 catch (error: any) + error.code === 11000 的脆弱写法。
 */

/** Mongoose / MongoDB 重复键错误码 */
export const DUPLICATE_KEY_ERROR_CODE = 11000;

interface DuplicateKeyError {
  code: number;
  keyValue?: Record<string, unknown>;
  keyPattern?: Record<string, number>;
}

/**
 * 判断错误是否为 MongoDB 重复键错误（E11000）。
 * 仅做形状判断，不依赖 instanceof，兼容 mongoose 抛出的原生驱动错误。
 */
export function isDuplicateKeyError(error: unknown): error is DuplicateKeyError {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return code === DUPLICATE_KEY_ERROR_CODE;
}

/**
 * 判断重复键错误是否由指定字段触发。
 * 同时检查 keyPattern（旧驱动）与 keyValue（新驱动）。
 */
export function isDuplicateKeyOnField(error: unknown, field: string): boolean {
  if (!isDuplicateKeyError(error)) return false;
  const hasInKeyPattern = Boolean(error.keyPattern?.[field]);
  const hasInKeyValue = Boolean(error.keyValue?.[field]);
  return hasInKeyPattern || hasInKeyValue;
}
