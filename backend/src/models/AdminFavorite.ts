import mongoose, { Document, Schema } from 'mongoose'

export interface IAdminFavorite extends Document {
  adminId: mongoose.Types.ObjectId
  documentId: mongoose.Types.ObjectId
  documentType: 'general' | 'video' | 'structured'
  createdAt: Date
}

const AdminFavoriteSchema = new Schema<IAdminFavorite>({
  adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
  documentType: { type: String, enum: ['general', 'video', 'structured'], required: true },
}, { timestamps: true })

AdminFavoriteSchema.index({ adminId: 1, documentId: 1 }, { unique: true })
AdminFavoriteSchema.index({ adminId: 1, createdAt: -1 })

export default mongoose.model<IAdminFavorite>('AdminFavorite', AdminFavoriteSchema)
