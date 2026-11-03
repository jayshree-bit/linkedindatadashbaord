import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    jobId: String,
    prospectId: String,
    name: String,
    linkedinUrl: String,
    status: String,
    details: String,
    createdAt: { type: Date, index: true },
  },
  { collection: 'linkedin_update_log', versionKey: false }
);
export default mongoose.model('LinkedinUpdateLog', schema);