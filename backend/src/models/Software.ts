import mongoose, { Document, Schema } from 'mongoose';

export interface ISoftware extends Document {
  name: string;
  slug?: string;
  categoryId?: mongoose.Types.ObjectId;
  headUnitTypeId?: mongoose.Types.ObjectId;
  description: string;
  downloadUrl: string;
  importantNote: string;
  language: 'en' | 'ru';  // 资料体系
  createdAt: Date;
  updatedAt: Date;
}

const softwareSchema = new Schema<ISoftware>({
  name: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    trim: true,
    unique: true,
    sparse: true,
    index: true
  },
  categoryId: {
    type: Schema.Types.ObjectId,
    ref: 'SoftwareCategory',
  },
  headUnitTypeId: {
    type: Schema.Types.ObjectId,
    ref: 'HeadUnitType',
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  downloadUrl: {
    type: String,
    required: true,
    trim: true
  },
  importantNote: {
    type: String,
    trim: true,
    default: ''
  },
  language: {
    type: String,
    enum: ['en', 'ru'],
    required: true,
    default: 'en'
  }
}, {
  timestamps: true
});

// 索引
softwareSchema.index({ language: 1, categoryId: 1 });
softwareSchema.index({ language: 1, headUnitTypeId: 1, categoryId: 1 });

export default mongoose.model<ISoftware>('Software', softwareSchema);
