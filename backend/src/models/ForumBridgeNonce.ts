import mongoose, { Document, Schema } from 'mongoose'

export interface IForumBridgeNonce extends Document {
  nonceHash: string
  forumUserId: string
  usedAt: Date
  expiresAt: Date
}

const ForumBridgeNonceSchema = new Schema<IForumBridgeNonce>({
  nonceHash: { type: String, required: true, unique: true },
  forumUserId: { type: String, required: true },
  usedAt: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, required: true },
}, { timestamps: false })

ForumBridgeNonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export default mongoose.model<IForumBridgeNonce>('ForumBridgeNonce', ForumBridgeNonceSchema)
