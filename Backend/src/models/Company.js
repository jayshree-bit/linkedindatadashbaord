import mongoose from 'mongoose';

const companySchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, index: true },
    emailAddress: { type: String, trim: true, lowercase: true, index: true },
    phoneNumber: { type: String, trim: true },

    address1: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zipcode: { type: String, trim: true },
    country: { type: String, trim: true },

    industry: { type: String, trim: true },
    subIndustry: { type: String, trim: true },

    exactEmployeeSize: { type: String, trim: true },
    employeeSize: { type: String, trim: true },
    exactRevenue: { type: String, trim: true },
    revenue: { type: String, trim: true },

    domain: { type: String, trim: true, index: true },
    website: { type: String, trim: true },
    linkedinUrl: { type: String, trim: true },
    revenueLink: { type: String, trim: true },

    sicCode: { type: String, trim: true },
    naicsCode: { type: String, trim: true },
    raComments: { type: String, trim: true },
    addressLink: { type: String, trim: true },
    callNotes: { type: String, trim: true },
    note1: { type: String, trim: true },
    note2: { type: String, trim: true },
    note3: { type: String, trim: true },

    // Import tracking
    nameKey: { type: String, index: true }, // trimmed + lowercased name, used for duplicate checks
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    uploadedByName: { type: String, trim: true },
    importBatchId: { type: String, index: true },
  },
  { timestamps: true }
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

companySchema.index({ createdAt: -1, _id: -1 });

export default mongoose.model('Company', companySchema);