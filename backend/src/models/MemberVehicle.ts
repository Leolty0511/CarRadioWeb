import mongoose, { Document, Schema } from 'mongoose'

export interface IMemberVehicle extends Document {
  memberId: mongoose.Types.ObjectId
  vehicleId: mongoose.Types.ObjectId
  brand: string
  modelName: string
  yearRange: string
  generation: string
  nickname: string
  isDefault: boolean
  forumVisibility: 'visible' | 'hidden'
  createdAt: Date
  updatedAt: Date
}

const MemberVehicleSchema = new Schema<IMemberVehicle>({
  memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
  vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
  // Snapshots keep user data readable when an administrator later corrects the catalog.
  brand: { type: String, required: true, trim: true, maxlength: 100 },
  modelName: { type: String, required: true, trim: true, maxlength: 150 },
  yearRange: { type: String, required: true, trim: true, maxlength: 50 },
  generation: { type: String, default: '', trim: true, maxlength: 100 },
  nickname: { type: String, default: '', trim: true, maxlength: 80 },
  isDefault: { type: Boolean, default: false, index: true },
  forumVisibility: { type: String, enum: ['visible', 'hidden'], default: 'visible' },
}, { timestamps: true, collection: 'member_vehicles' })

MemberVehicleSchema.index({ memberId: 1, vehicleId: 1 }, { unique: true })
MemberVehicleSchema.index({ memberId: 1, isDefault: 1 })
// At most one default vehicle per member. Existing duplicate data must be
// reconciled before production index creation if autoIndex is enabled.
MemberVehicleSchema.index({ memberId: 1 }, { unique: true, partialFilterExpression: { isDefault: true }, name: 'member_one_default_vehicle' })

export default mongoose.model<IMemberVehicle>('MemberVehicle', MemberVehicleSchema)
