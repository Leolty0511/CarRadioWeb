import mongoose, { Document, Schema } from 'mongoose'

export interface IAdminInvitation extends Document {
  email: string
  nickname: string
  permissions: string[]
  tokenHash: string
  invitedBy: mongoose.Types.ObjectId
  expiresAt: Date
  acceptedAt: Date | null
  revokedAt: Date | null
  deliveryStatus: 'pending' | 'sent' | 'failed'
  sendError: string | null
  createdAt: Date
  updatedAt: Date
}

const AdminInvitationSchema = new Schema<IAdminInvitation>(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    nickname: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    permissions: [
      {
        type: String,
        required: true,
      },
    ],
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    deliveryStatus: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending',
    },
    sendError: {
      type: String,
      default: null,
      maxlength: 500,
    },
  },
  { timestamps: true }
)

AdminInvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 })
AdminInvitationSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { acceptedAt: null, revokedAt: null } }
)

export default mongoose.model<IAdminInvitation>('AdminInvitation', AdminInvitationSchema)
