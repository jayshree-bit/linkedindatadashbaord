
import mongoose from 'mongoose';

const prospectSchema = new mongoose.Schema(
  {
    employeeCode: { type: String, trim: true, default: '' },
    employeeName: { type: String, trim: true, default: '' },
    date: { type: String, trim: true, default: '' },
    campaign: { type: String, trim: true, default: '' },

    firstName: { type: String, trim: true, default: '' },
    lastName: { type: String, trim: true, default: '' },
    companyName: { type: String, trim: true, default: '' },
    emailAddress: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },

    specificTitle: { type: String, trim: true, default: '' },
    jobLevel: { type: String, trim: true, default: '' },
    jobRole: { type: String, trim: true, default: '' },
    phoneNumber: { type: String, trim: true, default: '' },

    address1: { type: String, trim: true, default: '' },
    address2: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    zipcode: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: '' },

    mainIndustry: { type: String, trim: true, default: '' },
    industry: { type: String, trim: true, default: '' },
    seeAllEmployeeSize: { type: String, trim: true, default: '' },
    employeeSize: { type: String, trim: true, default: '' },
    exactRevenue: { type: String, trim: true, default: '' },
    revenue: { type: String, trim: true, default: '' },

    companyDomain: { type: String, trim: true, default: '' },
    website: { type: String, trim: true, default: '' },
    companyLinkedinUrl: { type: String, trim: true, default: '' },
    linkedinProfileLink: { type: String, trim: true, default: '' },
    linkedinProfileLinkSN: { type: String, trim: true, default: '' },
    revenueLink: { type: String, trim: true, default: '' },

    sicCode: { type: String, trim: true, default: '' },
    naicsCode: { type: String, trim: true, default: '' },
    prospectTenure: { type: String, trim: true, default: '' },

    raComment: { type: String, trim: true, default: '' },
    addressLink: { type: String, trim: true, default: '' },
    callNotes: { type: String, trim: true, default: '' },
    dispositions: { type: String, trim: true, default: '' },

    note1: { type: String, trim: true, default: '' },
    note2: { type: String, trim: true, default: '' },
    note3: { type: String, trim: true, default: '' },

    status: {
  type: String,
  enum: ['Qualified', 'DisQualified'],
  trim: true,
  default: 'Qualified',
},
    primaryReason: { type: String, trim: true, default: '' },
    qaComment: { type: String, trim: true, default: '' },
    ebbStatus: { type: String, trim: true, default: '' },
    auditorName: { type: String, trim: true, default: '' },
    auditDate: { type: String, trim: true, default: '' },
      uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    importBatchId: { type: String, trim: true, default: '', index: true },
  },
  { timestamps: true }
);
prospectSchema.index({ createdAt: -1, _id: -1 });
prospectSchema.index({ uploadedBy: 1, status: 1 });
export default mongoose.model('Prospect', prospectSchema);
