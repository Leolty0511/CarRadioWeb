import mongoose, { Document, Schema } from 'mongoose'

export interface IForumOAuthAuthorizationCode extends Document {
  codeHash: string
  memberId: mongoose.Types.ObjectId
  clientId: string
  redirectUri: string
  expiresAt: Date
  usedAt: Date | null
  createdAt: Date
}

const ForumOAuthAuthorizationCodeSchema = new Schema<IForumOAuthAuthorizationCode>({
  codeHash: { type: String, required: true, unique: true, index: true },
  memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
  clientId: { type: String, required: true, index: true },
  redirectUri: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: true },
  usedAt: { type: Date, default: null, index: true },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'forum_oauth_authorization_codes' })

ForumOAuthAuthorizationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export default mongoose.model<IForumOAuthAuthorizationCode>('ForumOAuthAuthorizationCode', ForumOAuthAuthorizationCodeSchema)
