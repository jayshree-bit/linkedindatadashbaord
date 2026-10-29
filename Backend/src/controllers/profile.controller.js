
import User from "../models/User.js";

export const uploadMyProfilePhoto = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "Please select a profile photo",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          profilePhoto: `/uploads/profiles/${req.file.filename}`,
        },
      },
      { new: true }
    )
      .select("-password")
      .populate("role");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.json({
      message: "Profile photo updated successfully",
      user,
    });
  } catch (error) {
    next(error);
  }
};
