
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const publicUser = (u) => ({
  id: u._id,
  email: u.email,
  username: u.username,
  name: u.name,
  phone: u.phone,
  role: u.role,
});

export const login = async (email, password) => {
  const user = await User.findOne({
    email: String(email).toLowerCase(),
  }).populate("role");

  if (!user || !(await bcrypt.compare(password, user.password))) {
    const e = new Error("Invalid email or password");
    e.status = 401;
    throw e;
  }

  const token = jwt.sign(
  {
    id: user._id.toString(),
    email: user.email,
    username: user.username,
    name: user.name,
    phone: user.phone,
    role: user.role?._id?.toString(),
  },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES || "1d" }
);

  return { token, user: publicUser(user) };
};

export const getUserById = async (userId) => {
  const user = await User.findById(userId).populate("role");

  if (!user) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }

  return publicUser(user);
};