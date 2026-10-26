
import mongoose from 'mongoose';

const companySchema = new mongoose.Schema(
  {
    // Basic company information
    name: { type: String, trim: true, index: true },
    industry: { type: String, trim: true },
    subIndustry: { type: String, trim: true },
    website: { type: String, trim: true },
    domain: { type: String, trim: true, index: true },
    linkedinUrl: { type: String, trim: true },

    // Company address
    address1: { type: String, trim: true },
    address2: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zipcode: { type: String, trim: true },
    country: { type: String, trim: true },
    addressLink: { type: String, trim: true },

    // Company size and revenue
    employeeSize: { type: String, trim: true },
    exactEmployeeSize: { type: Number, default: null },
    exactRevenue: { type: String, trim: true },
    revenue: { type: String, trim: true },
    revenueLink: { type: String, trim: true },

    // Company classification
    sicCode: { type: String, trim: true },
    naicsCode: { type: String, trim: true },

    // Additional information
    raComments: { type: String, trim: true },
    callNotes: { type: String, trim: true },

    // Preserve any additional company-specific data
    additionalData: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
        // Contact + import tracking
    emailAddress: { type: String, trim: true, lowercase: true, index: true },
    nameKey: { type: String, index: true }, // trimmed + lowercased name, used for duplicate checks
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    uploadedByName: { type: String, trim: true },
    importBatchId: { type: String, index: true },
  },
  {
    timestamps: true
  }
);
const makeKey = (v) => String(v || '').trim().toLowerCase();

companySchema.pre('validate', function (next) {
  if (this.name) this.nameKey = makeKey(this.name);
  next();
});

companySchema.pre('findOneAndUpdate', function (next) {
  const set = this.getUpdate()?.$set;
  if (set?.name !== undefined) set.nameKey = makeKey(set.name);
  next();
});
export default mongoose.model('Company', companySchema);
