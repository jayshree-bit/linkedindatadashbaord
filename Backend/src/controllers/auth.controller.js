import * as auth from "../services/auth.service.js";
import User from "../models/User.js";
import bcrypt from "bcryptjs";

// "lax" works because the Netlify proxy makes the API same-site with the frontend.
const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: 24 * 60 * 60 * 1000,
};

// clearCookie only works when the options match the ones used to set it
const { maxAge, ...clearOptions } = cookieOptions;

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const result = await auth.login(email, password);

    res.cookie("token", result.token, cookieOptions);

    return res.status(200).json({
      user: result.user,
      message: "Login successful",
    });
  } catch (error) {
    next(error);
  }
};

export const logoutController = (req, res) => {
  res.clearCookie("token", clearOptions);
  res.json({ message: "Logged out successfully" });
};

export const getUserById = async (req, res, next) => {
  try {
    const user = await auth.getUserById(req.params.id);

    res.json({
      user,
      message: "User profile fetched successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const me = (req, res) => {
  res.json({ user: auth.publicUser(req.user) });
};

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current password and new password are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: "New password must be at least 8 characters",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Current password is incorrect",
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        message: "New password must differ from current password",
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.status(200).json({
      message: "Password changed successfully",
    });
  } catch (error) {
    next(error);
  }
};