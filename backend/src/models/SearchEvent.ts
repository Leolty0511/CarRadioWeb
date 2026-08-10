import mongoose, { Document, Schema } from 'mongoose'

export interface ISearchEvent extends Document {
  query: string
  resultCount: number
  source: 'global' | 'ai'
  language?: string
  principalType?: 'member' | 'admin' | 'guest'
  createdAt: Date
}

const SearchEventSchema = new Schema<ISearchEvent>({
  query: { type: String, required: true, trim: true, maxlength: 200 },
  resultCount: { type: Number, required: true, default: 0 },
  source: { type: String, enum: ['global', 'ai'], required: true },
  language: { type: String, default: '' },
  principalType: { type: String, enum: ['member', 'admin', 'guest'], default: 'guest' },
}, { timestamps: true, collection: 'search_events' })

SearchEventSchema.index({ source: 1, createdAt: -1 })
SearchEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 })

export default mongoose.model<ISearchEvent>('SearchEvent', SearchEventSchema)
