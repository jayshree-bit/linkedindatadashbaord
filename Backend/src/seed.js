import bcrypt from 'bcryptjs';
import Role from './models/Role.js';
import User from './models/User.js';
import Prospect from './models/Prospect.js';
import Company from './models/Company.js';

const P = (view, edit) => ({ view, edit });
const roles = [
  { name: 'Admin',   permissions: { prospect: P(true, true),  company: P(true, true),  user: P(true, true) } },
  { name: 'Manager', permissions: { prospect: P(true, true),  company: P(true, true),  user: P(false, false) } },
  { name: 'User',    permissions: { prospect: P(true, false), company: P(true, false), user: P(false, false) } },
];

export const seed = async () => {
  for (const r of roles) {
    // create only; later permission changes made in the UI are not overwritten
    await Role.updateOne({ name: r.name }, { $setOnInsert: r }, { upsert: true });
  }
  const admin = await Role.findOne({ name: 'Admin' });
  const email = process.env.ADMIN_EMAIL.toLowerCase();
  if (!(await User.findOne({ email }))) {
    await User.create({ email, password: await bcrypt.hash(process.env.ADMIN_PASSWORD, 10), role: admin._id });
    console.log(`Default admin created: ${email}`);
  }
  if (!(await Prospect.countDocuments())) {
    await Prospect.insertMany([
      { name: 'Asha Patil', email: 'asha@acme.com', phone: '9890000001', company: 'Acme', status: 'New' },
      { name: 'Rohan Shah', email: 'rohan@globex.com', phone: '9890000002', company: 'Globex', status: 'Contacted' },
    ]);
    await Company.insertMany([
      { name: 'Acme', industry: 'Manufacturing', website: 'acme.com', location: 'Pune' },
      { name: 'Globex', industry: 'Software', website: 'globex.com', location: 'Mumbai' },
    ]);
  }
};