import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;

    // Try the Bearer token first, then fall back to the cookie.
    // A stale Bearer token no longer blocks a valid cookie.
    const candidates = [bearerToken, req.cookies?.token].filter(Boolean);

    if (!candidates.length) {
      return res.status(401).json({
        message: 'Login required. Provide a Bearer token or login cookie.',
      });
    }

    let decoded = null;
    let lastError = null;

    for (const token of candidates) {
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!decoded) {
      return res.status(401).json({
        message:
          lastError?.name === 'TokenExpiredError'
            ? 'Token expired. Please log in again.'
            : 'Invalid or expired token',
      });
    }

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
    next(error);
  }
};

// authorize('user', 'edit')  or  authorize(req => resource, req => action)
export const authorize = (resource, action) => (req, res, next) => {
  const r = typeof resource === 'function' ? resource(req) : resource;
  const a = typeof action === 'function' ? action(req) : action;
  if (req.user?.role?.permissions?.[r]?.[a]) return next();
  res.status(403).json({ message: `No ${a} permission for ${r}` });
};