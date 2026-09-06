import mongoose, { Document, Schema } from 'mongoose'

export type SecurityStatus = 'normal' | 'suspicious' | 'blocked'
export type BanSource = 'manual' | 'automatic' | 'crowdsec'

export interface ISecurityIp extends Document {
  ip: string
  requestCount: number
  firstSeenAt: Date
  lastSeenAt: Date
  lastUrl: string
  lastMethod: string
  lastStatusCode: number
  lastUserAgent: string
  lastReferer: string
  requestsPerMinute: number
  status: SecurityStatus
  lastRule?: string
}

const SecurityIpSchema = new Schema<ISecurityIp>({
  ip: { type: String, required: true, unique: true, index: true },
  requestCount: { type: Number, default: 0 },
  firstSeenAt: { type: Date, default: Date.now, index: true },
  lastSeenAt: { type: Date, default: Date.now, index: true },
  lastUrl: { type: String, default: '' }, lastMethod: { type: String, default: '' },
  lastStatusCode: { type: Number, default: 0 }, lastUserAgent: { type: String, default: '' },
  lastReferer: { type: String, default: '' }, requestsPerMinute: { type: Number, default: 0 },
  status: { type: String, enum: ['normal', 'suspicious', 'blocked'], default: 'normal', index: true },
  lastRule: { type: String, default: '' },
}, { timestamps: true })
SecurityIpSchema.index({ lastSeenAt: -1 })

export interface ISecurityRequest extends Document {
  ip: string; time: Date; method: string; url: string; statusCode: number; userAgent: string; referer: string; responseTimeMs: number
}
const SecurityRequestSchema = new Schema<ISecurityRequest>({
  ip: { type: String, required: true, index: true }, time: { type: Date, default: Date.now },
  method: String, url: String, statusCode: Number, userAgent: String, referer: String, responseTimeMs: Number,
}, { timestamps: false })
SecurityRequestSchema.index({ time: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 })
SecurityRequestSchema.index({ ip: 1, time: -1 })

export interface ISecurityEvent extends Document {
  ip: string; rule: string; severity: 'low' | 'medium' | 'high'; details: string; requestCount?: number; createdAt: Date
}
const SecurityEventSchema = new Schema<ISecurityEvent>({
  ip: { type: String, required: true, index: true }, rule: { type: String, required: true, index: true },
  severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' }, details: { type: String, default: '' }, requestCount: Number,
}, { timestamps: true })
SecurityEventSchema.index({ createdAt: -1 })
SecurityEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 })

export interface ISecurityBan extends Document {
  ip: string; reason: string; source: BanSource; adminId?: mongoose.Types.ObjectId; adminName?: string; bannedAt: Date; expiresAt?: Date | null; active: boolean; unbannedAt?: Date | null
}
const SecurityBanSchema = new Schema<ISecurityBan>({
  ip: { type: String, required: true, index: true }, reason: { type: String, required: true, maxlength: 500 },
  source: { type: String, enum: ['manual', 'automatic', 'crowdsec'], default: 'manual' }, adminId: { type: Schema.Types.ObjectId, ref: 'User' }, adminName: String,
  bannedAt: { type: Date, default: Date.now }, expiresAt: { type: Date, default: null, index: true }, active: { type: Boolean, default: true, index: true }, unbannedAt: Date,
}, { timestamps: true })
SecurityBanSchema.index({ ip: 1, active: 1 })

export interface ISecurityWhitelist extends Document { ip: string; note?: string; addedBy?: mongoose.Types.ObjectId; createdAt: Date }
const SecurityWhitelistSchema = new Schema<ISecurityWhitelist>({ ip: { type: String, required: true, unique: true, index: true }, note: String, addedBy: { type: Schema.Types.ObjectId, ref: 'User' } }, { timestamps: true })

export interface ISecuritySettings extends Document {
  key: string; requestsPerMinute: number; hardLimit: number; apiRequestsPerMinute: number; loginFailures: number; notFoundThreshold: number; suspiciousThreshold: number; autoBan: boolean; defaultBanDurationHours: number; autoUnban: boolean; crowdsecEnabled: boolean
}
const SecuritySettingsSchema = new Schema<ISecuritySettings>({
  key: { type: String, unique: true, default: 'default' }, requestsPerMinute: { type: Number, default: 120 }, hardLimit: { type: Number, default: 300 }, apiRequestsPerMinute: { type: Number, default: 180 }, loginFailures: { type: Number, default: 10 }, notFoundThreshold: { type: Number, default: 100 }, suspiciousThreshold: { type: Number, default: 120 }, autoBan: { type: Boolean, default: true }, defaultBanDurationHours: { type: Number, default: 24 }, autoUnban: { type: Boolean, default: true }, crowdsecEnabled: { type: Boolean, default: false },
}, { timestamps: true })

export const SecurityIp = mongoose.model<ISecurityIp>('SecurityIp', SecurityIpSchema)
export const SecurityRequest = mongoose.model<ISecurityRequest>('SecurityRequest', SecurityRequestSchema)
export const SecurityEvent = mongoose.model<ISecurityEvent>('SecurityEvent', SecurityEventSchema)
export const SecurityBan = mongoose.model<ISecurityBan>('SecurityBan', SecurityBanSchema)
export const SecurityWhitelist = mongoose.model<ISecurityWhitelist>('SecurityWhitelist', SecurityWhitelistSchema)
export const SecuritySettings = mongoose.model<ISecuritySettings>('SecuritySettings', SecuritySettingsSchema)
