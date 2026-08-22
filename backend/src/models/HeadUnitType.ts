import { Document, Schema, Types, model } from 'mongoose'

export interface IHeadUnitType extends Document {
  name: string
  image: string
  description: string
  sortOrder: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const headUnitTypeSchema = new Schema<IHeadUnitType>({
  name: { type: String, required: true, unique: true, trim: true },
  image: { type: String, default: '', trim: true },
  description: { type: String, default: '', trim: true },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true })

headUnitTypeSchema.index({ sortOrder: 1, name: 1 })
headUnitTypeSchema.index({ isActive: 1 })

export const HeadUnitType = model<IHeadUnitType>('HeadUnitType', headUnitTypeSchema)
