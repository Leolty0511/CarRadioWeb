import mongoose, { Document, Schema } from 'mongoose'

export interface IManualCategory extends Document {
  name: string
  slug: string
  description: string
  order: number
  isActive: boolean
  createdBy?: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const manualCategorySchema = new Schema<IManualCategory>({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  slug: { type: String, required: true, trim: true, unique: true },
  description: { type: String, default: '', trim: true, maxlength: 500 },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

manualCategorySchema.index({ order: 1, name: 1 })

export default mongoose.model<IManualCategory>('ManualCategory', manualCategorySchema)
