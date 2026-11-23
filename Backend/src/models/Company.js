
import mongoose from 'mongoose';

const companySchema = new mongoose.Schema(
  {
    // Basic company information
    organizationId: { type: String, trim: true, index: true },
    name: { type: String, trim: true, index: true },
    companyLogo: { type: String, trim: true },

    // Contact information
    emailAddress: { type: String, trim: true, lowercase: true, index: true },
    FAX: { type: String, trim: true },
    headquarterPhone: { type: String, trim: true },

    // Address information
    address1: { type: String, trim: true },
    address2: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zipcode: { type: String, trim: true },
    country: { type: String, trim: true },
    headquarter: { type: String, trim: true },
    primaryAddress: { type: String, trim: true },
    addressLink: { type: String, trim: true },

    // Industry information
    industry: { type: String, trim: true },
    industryDetail: { type: String, trim: true },
    subIndustry: { type: String, trim: true },
    specialties: { type: String, trim: true },
    type: { type: String, trim: true },
    keywords: { type: String, trim: true },
    technologies: { type: String, trim: true },

    // Employee information
    companySize: { type: String, trim: true },
    exactEmployeeSize: { type: String, trim: true },
    employeeSize: { type: String, trim: true },
    employeesLink: { type: String, trim: true },
    linkedinFollowers: { type: String, trim: true },

    // Revenue information
    exactRevenue: { type: String, trim: true },
    revenue: { type: String, trim: true },
    competitors: { type: String, trim: true },
    annualRevenue: { type: String, trim: true },
    revenueLink: { type: String, trim: true },

    // Website and domain
    domain: { type: String, trim: true, index: true },
    website: { type: String, trim: true },
    websiteAsPerLinkedin: { type: String, trim: true },
    linkedinUrl: { type: String, trim: true },
    salesNavigatorLink: { type: String, trim: true },
    domainRank: { type: String, trim: true },

    // Social media
    facebookUrl: { type: String, trim: true },
    instagramUrl: { type: String, trim: true },
    twitterUrl: { type: String, trim: true },
    tiktokUrl: { type: String, trim: true },
    youtubeUrl: { type: String, trim: true },

    // Company status
    status: { type: String, trim: true },
    httpStatus: { type: String, trim: true },
    apolloStatus: { type: String, trim: true },
    zoominfo: { type: String, trim: true },
    qcStatus: {
      type: String,
      enum: ["Qualified", "DisQualified"],
      trim: true,
      default: "Qualified",
    },
    // Company description
    description: { type: String, trim: true },

    // Stock information
    stockSymbol: { type: String, trim: true },

    // Funding information
    totalFunding: { type: String, trim: true },
    latestFunding: { type: String, trim: true },
    latestFundingAmount: { type: String, trim: true },
    lastRaisedAt: { type: String, trim: true },

    // Scraping information
    scrapedAt: { type: String, trim: true },

    // Existing company fields
    sicCode: { type: String, trim: true },
    naicsCode: { type: String, trim: true },
    raComments: { type: String, trim: true },
    callNotes: { type: String, trim: true },
    note1: { type: String, trim: true },
    note2: { type: String, trim: true },
    note3: { type: String, trim: true },

    // Import tracking
    nameKey: { type: String, index: true },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    uploadedByName: { type: String, trim: true },
    importBatchId: { type: String, index: true },
  },
  {
    timestamps: true,
  }
);

// Normalize company name for duplicate checking
const makeKey = (value) =>
  String(value || '').trim().toLowerCase();

// Automatically create nameKey before validation
companySchema.pre('validate', function (next) {
  if (this.name !== undefined) {
    this.nameKey = makeKey(this.name);
  }
  next();
});

// Maintain nameKey during findOneAndUpdate
companySchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() || {};

  const updatedName =
    update.$set?.name !== undefined
      ? update.$set.name
      : update.name;

  if (updatedName !== undefined) {
    update.$set = {
      ...(update.$set || {}),
      nameKey: makeKey(updatedName),
    };

    this.setUpdate(update);
  }

  next();
});

// Index for latest companies
companySchema.index({ createdAt: -1, _id: -1 });

export default mongoose.model('Company', companySchema);