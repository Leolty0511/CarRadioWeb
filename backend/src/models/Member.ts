import mongoose, { Document, Schema } from 'mongoose'
import type { MemberDeviceType } from '../utils/memberDevice'

export type MemberStatus = 'pending' | 'active' | 'rejected' | 'suspended'

export interface IMemberLoginRecord {
  ip: string
  country: string
  region: string
  city: string
  userAgent: string
  createdAt: Date
}

export interface IMember extends Document {
  forumUserId?: string
  email: string
  nickname: string
  avatar: string
  passwordHash: string
  status: MemberStatus
  reviewNote: string
  registrationIp: string
  registrationCountry: string
  registrationRegion: string
  registrationCity: string
  lastLoginAt: Date | null
  lastLoginIp: string
  lastSeenAt: Date | null
  lastSeenIp: string
  lastSeenUserAgent: string
  lastSeenDeviceType: MemberDeviceType
  lastSeenOs: string
  lastSeenBrowser: string
  lastSeenBrowserVersion: string
  loginHistory: IMemberLoginRecord[]
  invitationPrefix: string
  approvedAt: Date | null
  approvedBy: mongoose.Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

const LoginRecordSchema = new Schema<IMemberLoginRecord>({
  ip: { type: String, required: true },
  country: { type: String, default: '未知' },
  region: { type: String, default: '未知' },
  city: { type: String, default: '未知' },
  userAgent: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
}, { _id: false })

const MemberSchema = new Schema<IMember>({
  forumUserId: { type: String, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  nickname: { type: String, required: true, trim: true, maxlength: 50 },
  avatar: { type: String, default: '' },
  passwordHash: { type: String, required: true, select: false },
  status: { type: String, enum: ['pending', 'active', 'rejected', 'suspended'], default: 'active', index: true },
  reviewNote: { type: String, default: '', maxlength: 500 },
  registrationIp: { type: String, default: '' },
  registrationCountry: { type: String, default: '未知' },
  registrationRegion: { type: String, default: '未知' },
  registrationCity: { type: String, default: '未知' },
  lastLoginAt: { type: Date, default: null },
  lastLoginIp: { type: String, default: '' },
  lastSeenAt: { type: Date, default: null, index: true },
  lastSeenIp: { type: String, default: '' },
  lastSeenUserAgent: { type: String, default: '', maxlength: 1000 },
  lastSeenDeviceType: { type: String, enum: ['desktop', 'mobile', 'tablet', 'unknown'], default: 'unknown' },
  lastSeenOs: { type: String, default: '' },
  lastSeenBrowser: { type: String, default: '' },
  lastSeenBrowserVersion: { type: String, default: '' },
  loginHistory: { type: [LoginRecordSchema], default: [] },
  invitationPrefix: { type: String, default: '' },
  approvedAt: { type: Date, default: null },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true })

MemberSchema.index({ status: 1, createdAt: -1 })
MemberSchema.index({ forumUserId: 1 }, { unique: true, sparse: true })
MemberSchema.index({ lastLoginAt: -1 })
MemberSchema.index({ status: 1, lastSeenAt: -1 })

export default mongoose.model<IMember>('Member', MemberSchema)
