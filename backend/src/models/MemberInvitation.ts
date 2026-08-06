import mongoose, { Document, Schema } from 'mongoose'

export interface IMemberInvitation extends Document {
  codeHash: string
  prefix: string
  note: string
  maxUses: number
  usedCount: number
  expiresAt: Date | null
  enabled: boolean
  createdBy: mongoose.Types.ObjectId
}

const MemberInvitationSchema = new Schema<IMemberInvitation>({
  codeHash: { type: String, required: true, unique: true, index: true },
  prefix: { type: String, required: true },
  note: { type: String, default: '', maxlength: 200 },
  maxUses: { type: Number, default: 1, min: 1, max: 10000 },
  usedCount: { type: Number, default: 0, min: 0 },
  expiresAt: { type: Date, default: null },
  enabled: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })

export default mongoose.model<IMemberInvitation>('MemberInvitation', MemberInvitationSchema)
