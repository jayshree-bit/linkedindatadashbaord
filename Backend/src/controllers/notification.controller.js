
import ImportNotification from '../models/ImportNotification.js';

export const getNotifications = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 10)
    );

    const [notifications, total, unreadCount] = await Promise.all([
      ImportNotification.find()
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      ImportNotification.countDocuments(),

      ImportNotification.countDocuments({ isRead: false }),
    ]);

    res.json({
      success: true,
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
    });
  }
};

export const markNotificationsRead = async (req, res) => {
  try {
    await ImportNotification.updateMany(
      { isRead: false },
      { $set: { isRead: true } }
    );

    res.json({
      success: true,
      message: 'Notifications marked as read',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to mark notifications as read',
    });
  }
};

export const clearNotifications = async (req, res) => {
  try {
    await ImportNotification.deleteMany({});

    res.json({
      success: true,
      message: 'Notifications cleared',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to clear notifications',
    });
  }
};
