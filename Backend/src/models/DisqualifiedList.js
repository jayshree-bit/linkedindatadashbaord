import mongoose from "mongoose";

const disqualifiedListSchema = new mongoose.Schema(
  {
    // Original prospect id, so you can trace or restore it later
    originalId: { type: mongoose.Schema.Types.ObjectId, index: true },

    // Snapshot of the full prospect document (all fields kept as-is)
    prospect: { type: mongoose.Schema.Types.Mixed, required: true },

    // Fields lifted out for fast lookup / blacklist checks
    emailAddress: { type: String, trim: true, lowercase: true, default: "", index: true },
    linkedinProfileLink: { type: String, trim: true, lowercase: true, default: "", index: true },
    firstName: { type: String, trim: true, default: "" },
    lastName: { type: String, trim: true, default: "" },
    companyName: { type: String, trim: true, default: "" },
    primaryReason: { type: String, trim: true, default: "" },

    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    deletedByName: { type: String, trim: true, default: "" },
    deletedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, collection: "disqualified_list" },
);

export default mongoose.model("DisqualifiedList", disqualifiedListSchema);