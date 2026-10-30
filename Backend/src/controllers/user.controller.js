import * as svc from "../services/user.service.js";
import User from "../models/User.js";
import { logUserActivity } from "../services/userActivity.service.js";
const wrap = (fn) => async (req, res, next) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    next(e);
  }
};

export const getUsers = wrap(() => svc.listUsers());
export const getRoles = wrap(() => svc.listRoles());
export const addUser = wrap((req) => svc.createUser(req.body));
export const editUser = wrap((req) => svc.updateUser(req.params.id, req.body));
export const removeUser = wrap(async (req) => {
  await svc.deleteUser(req.params.id, req.user._id);
  return { ok: true };
});
export const editRole = wrap((req) =>
  svc.updateRolePermissions(req.params.id, req.body.permissions),
);

export const updateMyProfile = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const { name, phone } = req.body;

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (phone !== undefined && typeof phone !== "string") {
      return res.status(400).json({ message: "Invalid phone number" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          name: name.trim(),
          phone: phone?.trim() ?? "",
        },
      },
      { new: true, runValidators: true }
    )
      .select("-password")
      .populate("role");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await logUserActivity(req, {
      userId,
      action: "PROFILE_UPDATED",
      description: "User updated their own profile",
      resource: "user",
      resourceId: userId,
      metadata: { fields: ["name", "phone"] },
    });

    return res.json({
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    console.error("Update my profile error:", error);
    return res.status(500).json({ message: "Failed to update profile" });
  }
};