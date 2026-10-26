import mongoose from 'mongoose';

const importNotificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['prospect', 'company'],
      required: true,
    },
    uploaderName: {
      type: String,
      default: 'Unknown user',
    },
    totalImported: {
      type: Number,
      default: 0,
    },
    qualifiedCount: {
      type: Number,
      default: 0,
    },
    disqualifiedCount: {
      type: Number,
      default: 0,
    },
    companyCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['success', 'failed', 'info'],
      default: 'success',
    },
    message: {
      type: String,
      default: '',
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model(
  'ImportNotification',
  importNotificationSchema
);