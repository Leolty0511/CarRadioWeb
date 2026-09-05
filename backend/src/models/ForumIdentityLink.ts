import mongoose, { Document, Schema } from 'mongoose'

export type ForumPrincipalType = 'member' | 'admin'
export type ForumIdentityLinkStatus = 'linked' | 'conflict' | 'disabled'

export interface IForumIdentityLink extends Document {
  principalType: ForumPrincipalType
  principalId: mongoose.Types.ObjectId
  subject: string
  flarumUserId?: string
  flarumUsername?: string
  status: ForumIdentityLinkStatus
  linkMethod: 'oauth' | 'legacy-email' | 'manual'
  conflictNote: string
  roleSyncStatus: 'pending' | 'synced' | 'conflict'
  roleConflict: string
  linkedAt: Date
  lastSyncAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const ForumIdentityLinkSchema = new Schema<IForumIdentityLink>({
  principalType: { type: String, enum: ['member', 'admin'], required: true },
  principalId: { type: Schema.Types.ObjectId, required: true, index: true },
  subject: { type: String, required: true, trim: true },
  flarumUserId: { type: String, trim: true },
  flarumUsername: { type: String, trim: true },
  status: { type: String, enum: ['linked', 'conflict', 'disabled'], default: 'linked', index: true },
  linkMethod: { type: String, enum: ['oauth', 'legacy-email', 'manual'], default: 'oauth' },
  conflictNote: { type: String, default: '', maxlength: 1000 },
  roleSyncStatus: { type: String, enum: ['pending', 'synced', 'conflict'], default: 'pending' },
  roleConflict: { type: String, default: '', maxlength: 500 },
  linkedAt: { type: Date, default: Date.now },
  lastSyncAt: { type: Date, default: null },
}, { timestamps: true, collection: 'forum_identity_links' })

ForumIdentityLinkSchema.index({ principalType: 1, principalId: 1 }, { unique: true })
ForumIdentityLinkSchema.index({ subject: 1 }, { unique: true })
ForumIdentityLinkSchema.index({ flarumUserId: 1 }, { unique: true, sparse: true })

export default mongoose.model<IForumIdentityLink>('ForumIdentityLink', ForumIdentityLinkSchema)
