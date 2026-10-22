import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({
        message: "Login required",
      });
    }

    const { id } = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(id).populate("role");

    if (!user) {
      return res.status(401).json({
        message: "User not found",
      });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
};

// authorize('user', 'edit')  or  authorize(req => resource, req => action)
export const authorize = (resource, action) => (req, res, next) => {
  const r = typeof resource === 'function' ? resource(req) : resource;
  const a = typeof action === 'function' ? action(req) : action;
  if (req.user?.role?.permissions?.[r]?.[a]) return next();
  res.status(403).json({ message: `No ${a} permission for ${r}` });
};