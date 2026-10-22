import mongoose from 'mongoose';
const perm = { view: { type: Boolean, default: false }, edit: { type: Boolean, default: false } };
const roleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },   // Admin | Manager | User
  permissions: { prospect: perm, company: perm, user: perm },
});
export default mongoose.model('Role', roleSchema);