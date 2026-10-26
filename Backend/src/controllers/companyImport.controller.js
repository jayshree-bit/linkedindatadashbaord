import ExcelJS from 'exceljs';
import { randomUUID } from 'crypto';
import Company from '../models/Company.js';

/* Excel header (lowercase) -> Company schema field.
   Headers not listed here are kept in additionalData, so nothing is lost. */
const COLUMN_MAP = {
  'company name': 'name',
  name: 'name',
  'email address': 'emailAddress',
  'company email': 'emailAddress',
  'company email address': 'emailAddress',
  email: 'emailAddress',

  industry: 'industry',
  'main industry': 'industry',
  'sub industry': 'subIndustry',
  website: 'website',
  'company domain': 'domain',
  domain: 'domain',
  'company linkedin url': 'linkedinUrl',
  'linkedin url': 'linkedinUrl',

  'address 1': 'address1',
  'address 2': 'address2',
  city: 'city',
  state: 'state',
  zipcode: 'zipcode',
  country: 'country',
  'address link': 'addressLink',

  'employee size': 'employeeSize',
  'see all employee size': 'exactEmployeeSize',
  'exact employee size': 'exactEmployeeSize',
  'exact revenue': 'exactRevenue',
  revenue: 'revenue',
  'revenue link': 'revenueLink',

  'sic code': 'sicCode',
  'naics code': 'naicsCode',
  'ra comments': 'raComments',
  'ra comment': 'raComments',
  'call notes': 'callNotes',
};

const INSERT_CHUNK = 1000;
const LOOKUP_CHUNK = 5000;
const JOB_TTL_MS = 30 * 60 * 1000;
const jobs = new Map();

const updateJob = (job, patch) => Object.assign(job, patch, { updatedAt: Date.now() });
const scale = (from, to, done, total) =>
  total > 0 ? Math.round(from + ((to - from) * done) / total) : to;

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const clean = (v) => {
  const s = String(v ?? '').trim();
  return s === '-' ? '' : s;
};
const nameKeyOf = (v) => clean(v).toLowerCase();
const emailOf = (v) => clean(v).replace(/^mailto:/i, '').toLowerCase();

const safeKey = (s) => String(s).replace(/[.$]/g, '_').trim().slice(0, 100);

function getExcelValue(cell) {
  const value = cell.value;
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (value.hyperlink) return value.hyperlink;
    if (value.richText) return value.richText.map((p) => p.text).join('');
    if (value.text != null) return value.text;
    if (value.result != null) return value.result;
    return '';
  }
  return value;
}

const getUploader = (req) => {
  const u = req.user || {};
  return {
    id: u._id || u.id || u.userId || null,
    name: u.name || u.fullName || u.employeeName || u.username || u.email || '',
  };
};

async function parseCompanies(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const columns = {}; // colNumber -> { field } | { extra }
  let recognised = 0;
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = String(getExcelValue(cell)).trim();
    if (!header) return;
    const field = COLUMN_MAP[header.toLowerCase()];
    if (field) {
      columns[colNumber] = { field };
      recognised += 1;
    } else {
      columns[colNumber] = { extra: safeKey(header) };
    }
  });
  if (!recognised) return [];

  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const company = {};
    const extra = {};
    let hasData = false;

    for (const [colNumber, target] of Object.entries(columns)) {
      let value = getExcelValue(row.getCell(Number(colNumber)));
      if (typeof value === 'string') value = value.trim();
      if (value === '' || value == null) continue;
      hasData = true;

      if (target.field === 'exactEmployeeSize') {
        const n = Number(String(value).replace(/,/g, ''));
        if (Number.isFinite(n)) company.exactEmployeeSize = n;
      } else if (target.field) {
        company[target.field] = String(value);
      } else {
        extra[target.extra] = value;
      }
    }

    if (hasData) {
      if (Object.keys(extra).length) company.additionalData = extra;
      rows.push(company);
    }
  });

  return rows;
}

/* Look up existing companies in batches so large $in lists stay fast. */
async function findExisting(names, emails, onStep) {
  const existingNames = new Set();
  const existingEmails = new Set();

  const nameParts = chunk(names, LOOKUP_CHUNK);
  const emailParts = chunk(emails, LOOKUP_CHUNK);
  const totalSteps = nameParts.length + emailParts.length;
  let step = 0;

  for (const part of nameParts) {
    const docs = await Company.find({ nameKey: { $in: part } }, { nameKey: 1 }).lean();
    docs.forEach((d) => existingNames.add(d.nameKey));
    onStep?.(++step, totalSteps);
  }
  for (const part of emailParts) {
    const docs = await Company.find({ emailAddress: { $in: part } }, { emailAddress: 1 }).lean();
    docs.forEach((d) => existingEmails.add(emailOf(d.emailAddress)));
    onStep?.(++step, totalSteps);
  }

  return { existingNames, existingEmails };
}

const insertInChunks = async (docs, onChunk) => {
  let inserted = 0;
  let done = 0;
  const errors = [];

  for (const part of chunk(docs, INSERT_CHUNK)) {
    try {
      const res = await Company.insertMany(part, { ordered: false });
      inserted += res.length;
    } catch (err) {
      inserted += err.insertedDocs?.length || 0;
      errors.push(err.message);
    }
    done += part.length;
    onChunk?.(done);
  }
  return { inserted, errors };
};

async function runImportJob(job, { buffer, uploader }) {
  try {
    updateJob(job, { stage: 'Reading file', percent: 3 });

    const parsed = await parseCompanies(buffer);
    if (!parsed.length) {
      return updateJob(job, {
        state: 'failed',
        error: 'No valid rows or recognised column headers found in the file.',
      });
    }

    const importBatchId = randomUUID();

    const rows = [];
    const invalid = [];
    for (const p of parsed) {
      const name = clean(p.name);
      if (!name) {
        invalid.push(p);
        continue;
      }
      rows.push({
        ...p,
        name,
        nameKey: nameKeyOf(name),
        emailAddress: emailOf(p.emailAddress) || undefined,
        uploadedBy: uploader.id,
        uploadedByName: uploader.name,
        importBatchId,
      });
    }

    updateJob(job, { percent: 10, totalRows: parsed.length });

    updateJob(job, { stage: 'Checking duplicates', processed: null, total: null });

    const names = [...new Set(rows.map((r) => r.nameKey))];
    const emails = [...new Set(rows.map((r) => r.emailAddress).filter(Boolean))];

    const { existingNames, existingEmails } = await findExisting(names, emails, (done, total) =>
      updateJob(job, { percent: scale(10, 30, done, total) })
    );

    const seenNames = new Set();
    const seenEmails = new Set();
    const uniqueRows = [];
    const duplicates = [];

    for (const row of rows) {
      const dupDb =
        existingNames.has(row.nameKey) || (row.emailAddress && existingEmails.has(row.emailAddress));
      const dupFile =
        seenNames.has(row.nameKey) || (row.emailAddress && seenEmails.has(row.emailAddress));

      if (dupDb || dupFile) {
        const byName = existingNames.has(row.nameKey) || seenNames.has(row.nameKey);
        duplicates.push({
          name: row.name,
          emailAddress: row.emailAddress || '',
          reason: `${dupDb ? 'Already exists in database' : 'Duplicate row in uploaded Excel'} (${
            byName ? 'company name' : 'email address'
          })`,
        });
        continue;
      }

      uniqueRows.push(row);
      seenNames.add(row.nameKey);
      if (row.emailAddress) seenEmails.add(row.emailAddress);
    }

    updateJob(job, { stage: 'Saving rows', percent: 30, processed: 0, total: uniqueRows.length });

    const { inserted, errors } = await insertInChunks(uniqueRows, (done) =>
      updateJob(job, {
        processed: done,
        percent: scale(30, 99, done, uniqueRows.length),
      })
    );

    return updateJob(job, {
      state: 'done',
      percent: 100,
      processed: uniqueRows.length,
      result: {
        message: 'Company Excel import completed.',
        importBatchId,
        uploadedBy: uploader.id,
        uploadedByName: uploader.name,
        totalRows: parsed.length,
        importedCount: inserted,
        failedCount: uniqueRows.length - inserted,
        invalidCount: invalid.length, // rows without a company name
        duplicateCount: duplicates.length,
        duplicates: duplicates.slice(0, 500),
        ...(errors.length && { errors: errors.slice(0, 5) }),
      },
    });
  } catch (err) {
    return updateJob(job, { state: 'failed', error: err.message || 'Import failed.' });
  }
}

export async function importCompaniesExcel(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload an Excel file.' });
    }

    const uploader = getUploader(req);
    if (!uploader.id) {
      return res.status(401).json({ message: 'Could not identify the uploading user.' });
    }

    const sentUploadedBy = String(req.body.uploadedBy || '').trim();
    if (sentUploadedBy && sentUploadedBy !== String(uploader.id)) {
      return res.status(403).json({ message: 'Uploader does not match the logged-in user.' });
    }

    const job = {
      id: randomUUID(),
      userId: String(uploader.id),
      state: 'running', // running | done | failed
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
    setTimeout(() => jobs.delete(job.id), JOB_TTL_MS).unref?.();

    res.status(202).json({ jobId: job.id });

    // Not awaited on purpose: the response is already sent.
    runImportJob(job, { buffer: req.file.buffer, uploader });
  } catch (error) {
    next(error);
  }
}

export function getCompanyImportStatus(req, res) {
  const job = jobs.get(req.params.jobId);
  const uploader = getUploader(req);

  if (!job || String(uploader.id) !== job.userId) {
    return res.status(404).json({
      message: 'Import job not found. It may have expired or the server restarted.',
    });
  }

  const { id, userId, ...status } = job;
  return res.json(status);
}