import mongoose, { Document, Schema } from 'mongoose'

export interface IMemberFavorite extends Document {
  memberId: mongoose.Types.ObjectId
  documentId: mongoose.Types.ObjectId
  documentType: 'general' | 'video' | 'structured'
  createdAt: Date
}

const MemberFavoriteSchema = new Schema<IMemberFavorite>({
  memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
  documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
  documentType: { type: String, enum: ['general', 'video', 'structured'], required: true },
}, { timestamps: true })

MemberFavoriteSchema.index({ memberId: 1, documentId: 1 }, { unique: true })
MemberFavoriteSchema.index({ memberId: 1, createdAt: -1 })

export default mongoose.model<IMemberFavorite>('MemberFavorite', MemberFavoriteSchema)
