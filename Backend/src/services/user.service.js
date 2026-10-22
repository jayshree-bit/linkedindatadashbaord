import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Role from "../models/Role.js";

const fail = (msg, status = 400) => {
  const e = new Error(msg);
  e.status = status;
  throw e;
};

export const listUsers = () =>
  User.find().select("-password").populate("role").sort("-createdAt");
export const listRoles = () => Role.find().sort("name");

// keep optional fields out of the document when blank (needed for the unique username index)
const optional = ({ username, name, phone }) => {
  const o = {};
  if (username?.trim()) o.username = username.trim().toLowerCase();
  if (name?.trim()) o.name = name.trim();
  if (phone?.trim()) o.phone = phone.trim();
  return o;
};

export const createUser = async ({ email, password, roleId, ...rest }) => {
  if (!email || !password || !roleId)
    fail("Email, password and role are required");
  if (await User.findOne({ email: email.toLowerCase() }))
    fail("Email already exists");
  const extra = optional(rest);
  if (extra.username && (await User.findOne({ username: extra.username })))
    fail("Username already exists");
  const u = await User.create({
    email,
    password: await bcrypt.hash(password, 10),
    role: roleId,
    ...extra,
  });
  return User.findById(u._id).select("-password").populate("role");
};

export const updateUser = async (id, { roleId, password, ...rest }) => {
  const set = {},
    unset = {};
  if (roleId) set.role = roleId;
  if (password) set.password = await bcrypt.hash(password, 10);
  for (const k of ["username", "name", "phone"]) {
    if (rest[k] === undefined) continue;
    const v = String(rest[k]).trim();
    if (v) set[k] = k === "username" ? v.toLowerCase() : v;
    else unset[k] = 1;
  }
  if (set.username) {
    const dup = await User.findOne({
      username: set.username,
      _id: { $ne: id },
    });
    if (dup) fail("Username already exists");
  }
  const update = {};
  if (Object.keys(set).length) update.$set = set;
  if (Object.keys(unset).length) update.$unset = unset;
  return User.findByIdAndUpdate(id, update, { new: true })
    .select("-password")
    .populate("role");
};

export const deleteUser = async (id, currentId) => {
  if (String(id) === String(currentId)) fail("You cannot delete yourself");
  await User.findByIdAndDelete(id);
};

export const updateRolePermissions = async (id, permissions) => {
  const role = await Role.findById(id);
  if (!role) fail("Role not found", 404);
  if (role.name === "Admin") fail("Admin permissions cannot be changed", 403);
  role.permissions = permissions;
  return role.save();
};
