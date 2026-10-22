import mongoose from 'mongoose';
export default mongoose.model('Company', new mongoose.Schema({
  name: String, industry: String, website: String, location: String,
}, { timestamps: true }));
