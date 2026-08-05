export type TransferRole = 'super_admin' | 'admin' | null
export type TransferState = 'transferred' | 'original' | 'no_owner' | 'invalid'

export function classifyTransferState(currentRole: TransferRole, targetRole: TransferRole): TransferState {
  if (currentRole === 'admin' && targetRole === 'super_admin') {return 'transferred'}
  if (currentRole === 'super_admin' && targetRole === 'admin') {return 'original'}
  if (currentRole === 'admin' && targetRole === 'admin') {return 'no_owner'}
  return 'invalid'
}
