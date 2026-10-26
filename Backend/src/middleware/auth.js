import jwt from 'jsonwebtoken';
import User from '../models/User.js';


export const authenticate = async (req, res, next) => {
  try {
    // Prefer the Authorization Bearer token; fall back to the cookie.
    const authHeader = req.headers.authorization;

    const bearerToken =
      authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : null;

    const token = bearerToken || req.cookies?.token;

    if (!token) {
      return res.status(401).json({
        message: 'Login required. Provide a Bearer token or login cookie.',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.id) {
      return res.status(401).json({
        message: 'Invalid token payload',
      });
    }

    const user = await User.findById(decoded.id).populate('role');

    if (!user) {
      return res.status(401).json({
        message: 'User not found',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      message:
        error.name === 'TokenExpiredError'
          ? 'Token expired. Please log in again.'
          : 'Invalid or expired token',
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