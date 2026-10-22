import mongoose from 'mongoose';
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  username: { type: String, trim: true, lowercase: true, unique: true, sparse: true }, // optional
  name: { type: String, trim: true },   // optional
  phone: { type: String, trim: true },  // optional
  password: { type: String, required: true },
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
}, { timestamps: true });
export default mongoose.model('User', userSchema);