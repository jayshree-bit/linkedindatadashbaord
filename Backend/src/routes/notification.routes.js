import express from 'express';
import {
  getNotifications,
  markNotificationsRead,
  clearNotifications,
} from '../controllers/notification.controller.js';

const router = express.Router();

router.get('/', getNotifications);
router.patch('/read', markNotificationsRead);
router.delete('/', clearNotifications);

export default router;