import mongoose, { Document, Schema } from 'mongoose'

export interface IForumOAuthAccessToken extends Document {
  tokenHash: string
  memberId: mongoose.Types.ObjectId
  clientId: string
  expiresAt: Date
  createdAt: Date
}

const ForumOAuthAccessTokenSchema = new Schema<IForumOAuthAccessToken>({
  tokenHash: { type: String, required: true, unique: true, index: true },
  memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
  clientId: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true, index: true },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'forum_oauth_access_tokens' })

ForumOAuthAccessTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export default mongoose.model<IForumOAuthAccessToken>('ForumOAuthAccessToken', ForumOAuthAccessTokenSchema)
