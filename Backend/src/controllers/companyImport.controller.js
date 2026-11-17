
import ExcelJS from 'exceljs';
import { randomUUID } from 'crypto';

import Company from '../models/Company.js';
import { emitImportCompleted } from '../utils/importNotifications.js';

// =====================================================
// EXCEL COLUMN MAPPING
// Excel header -> MongoDB Company field
// =====================================================

const COLUMN_MAP = {
  // Basic information
  'organization id': 'organizationId',
  'company name': 'name',
  'company logo': 'companyLogo',

  // LinkedIn
  'linkedin url': 'linkedinUrl',
  'company linkedin url': 'linkedinUrl',
  'sales navigator link': 'salesNavigatorLink',
  'linkedin followers': 'linkedinFollowers',

  // Website
  'website': 'website',
  'domain': 'domain',
  'company domain': 'domain',
  'website as per linkedin': 'websiteAsPerLinkedin',
  'domain rank': 'domainRank',

  // Status
  'status': 'status',
  'http status': 'httpStatus',
  'apollo status': 'apolloStatus',
  'zoominfo': 'zoominfo',
  'qc status': 'qcStatus',

  // Social media
  'facebook url': 'facebookUrl',
  'instagram': 'instagramUrl',
  'instagram url': 'instagramUrl',
  'twitter url': 'twitterUrl',
  'tiktok': 'tiktokUrl',
  'tiktok url': 'tiktokUrl',
  'youtube': 'youtubeUrl',
  'youtube url': 'youtubeUrl',

  // Address
  'street address': 'streetAddress',
  'address 1': 'address1',
  'city': 'city',
  'state': 'state',
  'country': 'country',
  'postal code': 'zipcode',
  'zipcode': 'zipcode',
  'headquarter': 'headquarter',
  'headquarters': 'headquarter',
  'headquarter phone': 'headquarterPhone',
  'primary address': 'primaryAddress',
  'address link': 'addressLink',

  // Contact
  'email format': 'emailAddress',
  'email address': 'emailAddress',
  'phone number': 'phoneNumber',

  // Company size
  'company size': 'companySize',
  'exact employee size': 'exactEmployeeSize',
  'see employee size': 'exactEmployeeSize',
  'employee size': 'exactEmployeeSize',
  'see all employee size': 'exactEmployeeSize',
  'employee size bracket': 'employeeSize',
  'employees link': 'employeesLink',

  // Industry
  'main industry': 'industry',
  'industry': 'industryDetail',
  'sub industry': 'subIndustry',
  'specialties': 'specialties',
  'type': 'type',
  'keywords': 'keywords',
  'technologies': 'technologies',

  // Description
  'description': 'description',

  // Revenue
  'revenue': 'revenue',
  'revenue range': 'revenueRange',
  'revenue bracket': 'revenueRange',
  'exact revenue': 'exactRevenue',
  'revenue link': 'revenueLink',
  'annual revenue': 'annualRevenue',

  // Stock
  'stock symbol': 'stockSymbol',

  // Funding
  'total funding': 'totalFunding',
  'latest funding': 'latestFunding',
  'latest funding amount': 'latestFundingAmount',
  'last raised at': 'lastRaisedAt',

  // Scraping
  'scraped at': 'scrapedAt',

  // Existing fields
  'sic code': 'sicCode',
  'naics code': 'naicsCode',
  'ra comments': 'raComments',
  'agent comments': 'raComments',
  'call notes': 'callNotes',
  'note1': 'note1',
  'note2': 'note2',
  'note3': 'note3',
};

const TEMPLATE_HEADERS = [
  'Organization ID',
  'Company Name',
  'Company Logo',
  'Email Format',
  'Phone Number',
  'Headquarter Phone',
  'Address 1',
  'Street Address',
  'City',
  'State',
  'Zipcode',
  'Country',
  'Headquarter',
  'Primary Address',
  'Address Link',
  'Main Industry',
  'Industry',
  'Specialties',
  'Type',
  'Keywords',
  'Technologies',
  'Company Size',
  'Exact Employee Size',
  'Employees Link',
  'Linkedin Followers',
  'Exact Revenue',
  'Revenue',
  'Revenue Range',
  'Annual Revenue',
  'Revenue Link',
  'Domain',
  'Website',
  'Website as per LinkedIn',
  'LinkedIn URL',
  'Sales Navigator Link',
  'Domain Rank',
  'Facebook URL',
  'Instagram URL',
  'Twitter URL',
  'TikTok URL',
  'YouTube URL',
  'Status',
  'HTTP Status',
  'Apollo Status',
  'ZoomInfo',
  'QC Status',
  'Description',
  'Stock Symbol',
  'Total Funding',
  'Latest Funding',
  'Latest Funding Amount',
  'Last Raised At',
  'Scraped At',
  'SIC Code',
  'NAICS Code',
  'RA Comments',
  'Call Notes',
  'Note1',
  'Note2',
  'Note3',
];

const normalizeHeader = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ');

for (const header of TEMPLATE_HEADERS) {
  const field = COLUMN_MAP[normalizeHeader(header)];
  if (!field || !Company.schema.path(field)) {
    throw new Error(`Company import template field is not mapped: "${header}".`);
  }
}

// =====================================================
// CONFIGURATION
// =====================================================

const INSERT_CHUNK = 1000;
const LOOKUP_CHUNK = 5000;
const JOB_TTL_MS = 30 * 60 * 1000;

const jobs = new Map();

export async function downloadCompanyImportTemplate(req, res, next) {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Company Import', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = TEMPLATE_HEADERS.map((header) => ({
      header,
      width: Math.min(32, Math.max(16, header.length + 4)),
    }));
    sheet.autoFilter = {
      from: 'A1',
      to: { row: 1, column: TEMPLATE_HEADERS.length },
    };

    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' },
    };

    const instructions = workbook.addWorksheet('Instructions');
    instructions.addRows([
      ['Company Import Template'],
      ['Company Name is required for every company row.'],
      ['Leave fields blank when you do not have a value.'],
      ['Companies with the same name and country are skipped as duplicates.'],
      ['Keep the header row in the first worksheet unchanged.'],
    ]);
    instructions.getColumn(1).width = 90;
    instructions.getRow(1).font = { bold: true, size: 14 };

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Company_Import_Template.xlsx"',
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.send(Buffer.from(buffer));
  } catch (error) {
    return next(error);
  }
}

// =====================================================
// HELPERS
// =====================================================

const updateJob = (job, patch) =>
  Object.assign(job, patch, {
    updatedAt: Date.now(),
  });

const scale = (from, to, done, total) =>
  total > 0
    ? Math.round(from + ((to - from) * done) / total)
    : to;

const chunk = (arr, size) => {
  const output = [];

  for (let i = 0; i < arr.length; i += size) {
    output.push(arr.slice(i, i + size));
  }

  return output;
};

// Clean Excel values
const clean = (value) => {
  const stringValue = String(value ?? '').trim();

  return stringValue === '-' ? '' : stringValue;
};

// Normalize company name
const keyOf = (value) =>
  clean(value).toLowerCase();

// Normalize email
const emailOf = (value) =>
  clean(value)
    .replace(/^mailto:/i, '')
    .toLowerCase();

// Duplicate key: same company name + country
const dupKey = (name, country) =>
  `${keyOf(name)}|${keyOf(country)}`;

// =====================================================
// GET EXCEL CELL VALUE
// =====================================================

function getExcelValue(cell) {
  const value = cell.value;

  if (value == null) return '';

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'object') {
    if (value.hyperlink) return value.hyperlink;

    if (value.richText) {
      return value.richText
        .map((part) => part.text)
        .join('');
    }

    if (value.text != null) {
      return value.text;
    }

    if (value.result != null) {
      return value.result;
    }

    return '';
  }

  return value;
}

// =====================================================
// GET UPLOADER INFORMATION
// =====================================================

const getUploader = (req) => {
  const user = req.user || {};

  return {
    id:
      user._id ||
      user.id ||
      user.userId ||
      null,

    name:
      user.name ||
      user.fullName ||
      user.employeeName ||
      user.username ||
      user.email ||
      '',
  };
};

// =====================================================
// PARSE COMPANY EXCEL
// =====================================================

async function parseCompanies(buffer) {
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];

  if (!sheet) {
    return {
      rows: [],
      missingName: false,
    };
  }

  // Excel column number -> Company field
  const colToField = {};

  sheet.getRow(1).eachCell(
    { includeEmpty: false },
    (cell, colNumber) => {
      const header = normalizeHeader(getExcelValue(cell));

      const field = COLUMN_MAP[header];

      if (field) {
        colToField[colNumber] = field;
      }
    }
  );

  // Company Name is mandatory
  if (!Object.values(colToField).includes('name')) {
    return {
      rows: [],
      missingName: true,
    };
  }

  const rows = [];

  sheet.eachRow(
    { includeEmpty: false },
    (row, rowNumber) => {
      if (rowNumber === 1) return;

      const company = {};
      let hasData = false;

      for (const [colNumber, field] of Object.entries(colToField)) {
        let value = clean(
          getExcelValue(row.getCell(Number(colNumber)))
        );

        if (!value) continue;

        if (field === 'exactEmployeeSize') {
          value = value.replace(/,/g, '');
        }

        if (field === 'emailAddress') {
          value = emailOf(value);
        }

        company[field] = value;
        hasData = true;
      }

      if (hasData) {
        rows.push(company);
      }
    }
  );

  return {
    rows,
    missingName: false,
  };
}

// =====================================================
// FIND EXISTING COMPANIES
// Duplicate checking by name + country
// =====================================================

async function findExisting(names, onStep) {
  const existing = new Set();

  const parts = chunk(names, LOOKUP_CHUNK);

  let step = 0;

  for (const part of parts) {
    const docs = await Company.find(
      {
        nameKey: {
          $in: part,
        },
      },
      {
        name: 1,
        nameKey: 1,
        country: 1,
      }
    ).lean();

    docs.forEach((doc) => {
      existing.add(
        dupKey(
          doc.name ?? doc.nameKey,
          doc.country
        )
      );
    });

    onStep?.(++step, parts.length);
  }

  return existing;
}

// =====================================================
// INSERT COMPANIES IN CHUNKS
// =====================================================

const insertInChunks = async (docs, onChunk) => {
  let inserted = 0;
  let done = 0;

  const errors = [];

  for (const part of chunk(docs, INSERT_CHUNK)) {
    try {
      const result = await Company.insertMany(
        part,
        {
          ordered: false,
        }
      );

      inserted += result.length;
    } catch (error) {
      inserted += error.insertedDocs?.length || 0;

      errors.push(error.message);
    }

    done += part.length;

    onChunk?.(done);
  }

  return {
    inserted,
    errors,
  };
};

// =====================================================
// MAIN IMPORT JOB
// =====================================================

async function runImportJob(
  job,
  {
    buffer,
    uploader,
    io,
  }
) {
  try {
    // Step 1: Read Excel
    updateJob(job, {
      stage: 'Reading file',
      percent: 3,
    });

    const {
      rows: parsed,
      missingName,
    } = await parseCompanies(buffer);

    if (missingName) {
      return updateJob(job, {
        state: 'failed',
        error: 'The file has no "Company Name" column.',
      });
    }

    if (!parsed.length) {
      return updateJob(job, {
        state: 'failed',
        error: 'No valid rows found in the file.',
      });
    }

    const importBatchId = randomUUID();

    // Step 2: Validate company names
    const rows = [];

    let invalidCount = 0;

    for (const company of parsed) {
      if (!company.name) {
        invalidCount++;
        continue;
      }

      rows.push({
        ...company,

        nameKey: keyOf(company.name),

        uploadedBy: uploader.id,
        uploadedByName: uploader.name,

        importBatchId,
      });
    }

    updateJob(job, {
      percent: 10,
      totalRows: parsed.length,
    });

    if (!rows.length) {
      return updateJob(job, {
        state: 'failed',
        error: 'No valid company names found in the Excel file.',
      });
    }

    // Step 3: Check database duplicates
    updateJob(job, {
      stage: 'Checking duplicates',
      processed: null,
      total: null,
    });

    const names = [
      ...new Set(
        rows.map((row) => row.nameKey)
      ),
    ];

    const existing = await findExisting(
      names,
      (done, total) => {
        updateJob(job, {
          percent: scale(10, 30, done, total),
        });
      }
    );

    // Step 4: Check duplicates inside Excel
    const seen = new Set();

    const uniqueRows = [];
    const duplicates = [];

    for (const row of rows) {
      const key = dupKey(
        row.name,
        row.country
      );

      const inDb = existing.has(key);
      const inFile = seen.has(key);

      if (inDb || inFile) {
        duplicates.push({
          name: row.name,
          country: row.country || '',
          emailAddress: row.emailAddress || '',

          reason: `${
            inDb
              ? 'Already exists in database'
              : 'Duplicate row in uploaded Excel'
          } (same company name and country)`,
        });

        continue;
      }

      uniqueRows.push(row);

      seen.add(key);
    }

    // Step 5: Save companies
    updateJob(job, {
      stage: 'Saving rows',
      percent: 30,
      processed: 0,
      total: uniqueRows.length,
    });

    const {
      inserted,
      errors,
    } = await insertInChunks(
      uniqueRows,
      (done) => {
        updateJob(job, {
          processed: done,
          percent: scale(
            30,
            99,
            done,
            uniqueRows.length
          ),
        });
      }
    );

    // Step 6: Complete import
    const failedCount = uniqueRows.length - inserted;

    updateJob(job, {
      state: 'done',
      stage: 'Completed',
      percent: 100,
      processed: uniqueRows.length,

      result: {
        message: 'Company Excel import completed.',

        importBatchId,

        uploadedBy: uploader.id,
        uploadedByName: uploader.name,

        totalRows: parsed.length,

        importedCount: inserted,
        failedCount,
        invalidCount,
        duplicateCount: duplicates.length,

        duplicates: duplicates.slice(0, 500),

        ...(errors.length && {
          errors: errors.slice(0, 5),
        }),
      },
    });

    // Step 7: Send import notification
    await emitImportCompleted(io, {
      type: 'company',

      uploaderName:
        uploader.name || 'Unknown user',

      totalImported: inserted,
      companyCount: inserted,

      status: 'success',

      message: `${
        uploader.name || 'A user'
      } imported ${inserted} companies`,
    });

    return job;

  } catch (error) {
    console.error(
      'Company Excel Import Error:',
      error
    );

    return updateJob(job, {
      state: 'failed',
      error: error.message || 'Import failed.',
    });
  }
}

// =====================================================
// IMPORT COMPANIES EXCEL API
// =====================================================

export async function importCompaniesExcel(
  req,
  res,
  next
) {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: 'Please upload an Excel file.',
      });
    }

    const uploader = getUploader(req);

    if (!uploader.id) {
      return res.status(401).json({
        message: 'Could not identify the uploading user.',
      });
    }

    const sentUploadedBy = String(
      req.body.uploadedBy || ''
    ).trim();

    if (
      sentUploadedBy &&
      sentUploadedBy !== String(uploader.id)
    ) {
      return res.status(403).json({
        message: 'Uploader does not match the logged-in user.',
      });
    }

    const job = {
      id: randomUUID(),

      userId: String(uploader.id),

      state: 'running',

      stage: 'Queued',
      percent: 0,

      processed: null,
      total: null,

      totalRows: 0,

      result: null,
      error: null,

      updatedAt: Date.now(),
    };

    jobs.set(job.id, job);

    // Remove expired job
    setTimeout(() => {
      jobs.delete(job.id);
    }, JOB_TTL_MS).unref?.();

    // Send response immediately
    res.status(202).json({
      jobId: job.id,
    });

    // Start import in background
    const io = req.app.get('io');

    runImportJob(job, {
      buffer: req.file.buffer,
      uploader,
      io,
    }).catch((error) => {
      console.error('Background import error:', error);

      updateJob(job, {
        state: 'failed',
        error: error.message || 'Import failed.',
      });
    });

  } catch (error) {
    next(error);
  }
}

// =====================================================
// GET COMPANY IMPORT STATUS API
// =====================================================

export function getCompanyImportStatus(
  req,
  res
) {
  const job = jobs.get(req.params.jobId);

  const uploader = getUploader(req);

  if (
    !job ||
    String(uploader.id) !== job.userId
  ) {
    return res.status(404).json({
      message:
        'Import job not found. It may have expired or the server restarted.',
    });
  }

  const {
    id,
    userId,
    ...status
  } = job;

  return res.json(status);
}