import mongoose from "mongoose";
import UserActivity from "../models/UserActivity.js";

export const getUserActivities = async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
    );

    const { userId, action, from, to } = req.query;
    const filter = {};

    // Non-admin users can view only their own activity.
    const roleName = req.user?.role?.name;
    const isAdmin = roleName?.toLowerCase() === "admin";

    if (isAdmin && userId) {
      if (!mongoose.isValidObjectId(userId)) {
        return res.status(400).json({ message: "Invalid userId" });
      }

      filter.user = userId;
    } else if (!isAdmin) {
      filter.user = req.user._id;
    }

    if (action) filter.action = action;

    if (from || to) {
      filter.createdAt = {};

      if (from) {
        const startDate = new Date(from);
        if (Number.isNaN(startDate.getTime())) {
          return res.status(400).json({ message: "Invalid from date" });
        }
        filter.createdAt.$gte = startDate;
      }

      if (to) {
        const endDate = new Date(to);
        if (Number.isNaN(endDate.getTime())) {
          return res.status(400).json({ message: "Invalid to date" });
        }
        filter.createdAt.$lte = endDate;
      }
    }

    const [activities, total] = await Promise.all([
      UserActivity.find(filter)
        .populate("user", "name email username profilePhoto")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      UserActivity.countDocuments(filter),
    ]);

    return res.status(200).json({
      message: "User activities fetched successfully",
      activities,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};