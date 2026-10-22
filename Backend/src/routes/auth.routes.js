import { Router } from 'express';

import {
  login,
  me,
  logoutController,
  getUserById,
} from '../controllers/auth.controller.js';

import { authenticate } from '../middleware/auth.js';

const r = Router();

r.post('/login', login);
r.post('/logout', logoutController);

r.get('/me', authenticate, me);
r.get('/users/:id', authenticate, getUserById);

export default r;