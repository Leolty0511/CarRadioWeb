import mongoose, { Document, Schema } from 'mongoose'

export interface IUserManual extends Document {
  filename: string
  title: string
  productModel: string
  categoryId?: mongoose.Types.ObjectId
  description: string
  version: string
  sortOrder: number
  isPublished: boolean
  size: number
  createdAt: Date
  updatedAt: Date
}

const userManualSchema = new Schema<IUserManual>({
  filename: { type: String, required: true, trim: true, unique: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  productModel: { type: String, required: true, trim: true, maxlength: 120 },
  categoryId: { type: Schema.Types.ObjectId, ref: 'ManualCategory' },
  description: { type: String, default: '', trim: true, maxlength: 2000 },
  version: { type: String, default: '', trim: true, maxlength: 50 },
  sortOrder: { type: Number, default: 0 },
  isPublished: { type: Boolean, default: true },
  size: { type: Number, required: true, default: 0 },
}, { timestamps: true })

userManualSchema.index({ categoryId: 1, sortOrder: 1, title: 1 })
userManualSchema.index({ productModel: 1 })

export default mongoose.model<IUserManual>('UserManual', userManualSchema)
