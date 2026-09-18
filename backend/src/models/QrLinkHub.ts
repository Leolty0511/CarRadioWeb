import mongoose, { Document, Schema } from 'mongoose'

export const QR_LINK_TYPES = ['video', 'pdf', 'website', 'page', 'download', 'other'] as const
export type QrLinkType = typeof QR_LINK_TYPES[number]

export interface IQrLinkItem {
  _id: mongoose.Types.ObjectId
  label: string
  description: string
  url: string
  type: QrLinkType
  enabled: boolean
  order: number
}

export interface IQrLinkHub extends Document {
  token: string
  name: string
  title: string
  description: string
  enabled: boolean
  links: IQrLinkItem[]
  createdBy: mongoose.Types.ObjectId
  updatedBy: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const QrLinkItemSchema = new Schema<IQrLinkItem>({
  label: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, default: '', trim: true, maxlength: 240 },
  url: { type: String, required: true, trim: true, maxlength: 2000 },
  type: { type: String, required: true, enum: QR_LINK_TYPES, default: 'website' },
  enabled: { type: Boolean, default: true },
  order: { type: Number, default: 0, min: 0, max: 1000 },
}, { _id: true })

const QrLinkHubSchema = new Schema<IQrLinkHub>({
  token: { type: String, required: true, unique: true, immutable: true, minlength: 12, maxlength: 32 },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: '', trim: true, maxlength: 500 },
  enabled: { type: Boolean, default: true },
  links: {
    type: [QrLinkItemSchema],
    default: [],
    validate: {
      validator: (items: IQrLinkItem[]) => items.length <= 20,
      message: 'A QR link hub cannot contain more than 20 links',
    },
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, collection: 'qr_link_hubs' })

QrLinkHubSchema.index({ updatedAt: -1 })

export default mongoose.model<IQrLinkHub>('QrLinkHub', QrLinkHubSchema)
