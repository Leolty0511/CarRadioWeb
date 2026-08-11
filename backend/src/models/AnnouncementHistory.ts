import mongoose, { Document, Schema } from 'mongoose'

export interface IAnnouncementHistory extends Document {
  sourceAnnouncementId: mongoose.Types.ObjectId
  language: 'en' | 'ru'
  title: string
  content: string
  contentHtml?: string
  imageUrl?: string
  style: {
    type: 'info' | 'warning' | 'danger' | 'success'
    fontSize: 'sm' | 'md' | 'lg'
    fontWeight: 'normal' | 'bold'
    fontStyle: 'normal' | 'italic'
    textColor?: string
  }
  noticeCardStyle: 'glass' | 'scroll' | 'wax' | 'device'
  publishedAt: Date
  expiresAt: Date
}

const AnnouncementHistorySchema = new Schema<IAnnouncementHistory>({
  sourceAnnouncementId: { type: Schema.Types.ObjectId, ref: 'Announcement', required: true },
  language: { type: String, enum: ['en', 'ru'], required: true },
  title: { type: String, default: '', maxlength: 160 },
  content: { type: String, required: true, maxlength: 5000 },
  contentHtml: { type: String, default: '', maxlength: 20000 },
  imageUrl: { type: String, default: '' },
  style: {
    type: { type: String, enum: ['info', 'warning', 'danger', 'success'], default: 'info' },
    fontSize: { type: String, enum: ['sm', 'md', 'lg'], default: 'md' },
    fontWeight: { type: String, enum: ['normal', 'bold'], default: 'normal' },
    fontStyle: { type: String, enum: ['normal', 'italic'], default: 'normal' },
    textColor: { type: String, default: '' },
  },
  noticeCardStyle: { type: String, enum: ['glass', 'scroll', 'wax', 'device'], default: 'glass' },
  publishedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: false })

AnnouncementHistorySchema.index({ language: 1, publishedAt: -1 })
AnnouncementHistorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
AnnouncementHistorySchema.index({ sourceAnnouncementId: 1, publishedAt: 1 }, { unique: true })

export const AnnouncementHistory = mongoose.model<IAnnouncementHistory>('AnnouncementHistory', AnnouncementHistorySchema)
