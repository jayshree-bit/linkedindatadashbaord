import UserActivity from "../models/UserActivity.js";

export const logUserActivity = async (
  req,
  { action, description, resource = null, resourceId = null, metadata = {} }
) => {
  try {
    if (!req.user?._id) return;

    await UserActivity.create({
      user: req.user._id,
      action,
      description,
      resource,
      resourceId,
      metadata,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") || null,
    });
  } catch (error) {
    // Activity logging should not break the main application operation.
    console.error("Failed to log user activity:", error.message);
  }
};

