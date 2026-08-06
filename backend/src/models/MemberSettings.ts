import mongoose, { Document, Schema } from 'mongoose'

export interface IMemberSettings extends Document {
  key: 'global'
  registrationEnabled: boolean
  approvalRequired: boolean
  invitationRequired: boolean
  updatedBy?: mongoose.Types.ObjectId
}

const MemberSettingsSchema = new Schema<IMemberSettings>({
  key: { type: String, default: 'global', unique: true },
  registrationEnabled: { type: Boolean, default: true },
  approvalRequired: { type: Boolean, default: false },
  invitationRequired: { type: Boolean, default: false },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true })

export async function getMemberSettings(): Promise<IMemberSettings> {
  return MemberSettings.findOneAndUpdate(
    { key: 'global' },
    { $setOnInsert: { key: 'global' } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )
}

const MemberSettings = mongoose.model<IMemberSettings>('MemberSettings', MemberSettingsSchema)
export default MemberSettings
