
import * as auth from "../services/auth.service.js";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 24 * 60 * 60 * 1000,
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const result = await auth.login(email, password);

    res.cookie("token", result.token, cookieOptions);

    res.json({
      user: result.user,
      message: "Login successful",
    });
  } catch (error) {
    next(error);
  }
};

export const logoutController = (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

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
