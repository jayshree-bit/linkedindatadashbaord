import ExcelJS from 'exceljs';
import { randomUUID } from 'crypto';
import Company from '../models/Company.js';
import { emitImportCompleted } from '../utils/importNotifications.js';

/* Excel header (lowercase) -> Company field. Only these columns are imported. */
const COLUMN_MAP = {
  'company name': 'name',
  'email format': 'emailAddress',
  'phone number': 'phoneNumber',
  'address 1': 'address1',
  city: 'city',
  state: 'state',
  zipcode: 'zipcode',
  country: 'country',
  'main industry': 'industry',
  'sub industry': 'subIndustry',
  'see all employee size': 'exactEmployeeSize',
  'employee size bracket': 'employeeSize',
  'exact revenue': 'exactRevenue',
  'revenue bracket': 'revenue',
  'company domain': 'domain',
  website: 'website',
  'company linkedin url': 'linkedinUrl',
  'revenue link': 'revenueLink',
  'sic code': 'sicCode',
  'naics code': 'naicsCode',
  'agent comments': 'raComments',
  'address link': 'addressLink',
  'call notes': 'callNotes',
  note1: 'note1',
  note2: 'note2',
  note3: 'note3',
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

// Trim, and treat "-" as empty.
const clean = (v) => {
  const s = String(v ?? '').trim();
  return s === '-' ? '' : s;
};
const keyOf = (v) => clean(v).toLowerCase();
const emailOf = (v) => clean(v).replace(/^mailto:/i, '').toLowerCase();

// Duplicate key: same company name AND same country.
const dupKey = (name, country) => `${keyOf(name)}|${keyOf(country)}`;

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
  if (!sheet) return { rows: [], missingName: false };

  // colNumber -> schema field (unknown headers are ignored)
  const colToField = {};
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const field = COLUMN_MAP[String(getExcelValue(cell)).trim().toLowerCase()];
    if (field) colToField[colNumber] = field;
  });

  if (!Object.values(colToField).includes('name')) {
    return { rows: [], missingName: true };
  }

  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const company = {};
    let hasData = false;

    for (const [colNumber, field] of Object.entries(colToField)) {
      let value = clean(getExcelValue(row.getCell(Number(colNumber))));
      if (!value) continue;

      if (field === 'exactEmployeeSize') value = value.replace(/,/g, '');
      if (field === 'emailAddress') value = emailOf(value);

      company[field] = value;
      hasData = true;
    }

    if (hasData) rows.push(company);
  });

  return { rows, missingName: false };
}

/* Existing companies: look up by name in batches, then compare name + country. */
async function findExisting(names, onStep) {
  const existing = new Set();
  const parts = chunk(names, LOOKUP_CHUNK);
  let step = 0;

  for (const part of parts) {
    const docs = await Company.find(
      { nameKey: { $in: part } },
      { name: 1, nameKey: 1, country: 1 },
    ).lean();
    docs.forEach((d) => existing.add(dupKey(d.name ?? d.nameKey, d.country)));
    onStep?.(++step, parts.length);
  }

  return existing;
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

async function runImportJob(job, { buffer, uploader, io }) {
  try {
    updateJob(job, { stage: 'Reading file', percent: 3 });

    const { rows: parsed, missingName } = await parseCompanies(buffer);
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

    const rows = [];
    let invalidCount = 0;
    for (const p of parsed) {
      if (!p.name) {
        invalidCount += 1; // company name is required
        continue;
      }
      rows.push({
        ...p,
        nameKey: keyOf(p.name),
        uploadedBy: uploader.id,
        uploadedByName: uploader.name,
        importBatchId,
      });
    }

    updateJob(job, { percent: 10, totalRows: parsed.length });
    updateJob(job, { stage: 'Checking duplicates', processed: null, total: null });

    const names = [...new Set(rows.map((r) => r.nameKey))];
    const existing = await findExisting(names, (done, total) =>
      updateJob(job, { percent: scale(10, 30, done, total) }),
    );

    const seen = new Set();
    const uniqueRows = [];
    const duplicates = [];

    for (const row of rows) {
      const key = dupKey(row.name, row.country);
      const inDb = existing.has(key);
      const inFile = seen.has(key);

      if (inDb || inFile) {
        duplicates.push({
          name: row.name,
          country: row.country || '',
          emailAddress: row.emailAddress || '',
          reason: `${
            inDb ? 'Already exists in database' : 'Duplicate row in uploaded Excel'
          } (same company name and country)`,
        });
        continue;
      }

      uniqueRows.push(row);
      seen.add(key);
    }

    updateJob(job, { stage: 'Saving rows', percent: 30, processed: 0, total: uniqueRows.length });

    const { inserted, errors } = await insertInChunks(uniqueRows, (done) =>
      updateJob(job, {
        processed: done,
        percent: scale(30, 99, done, uniqueRows.length),
      }),
    );

    updateJob(job, {
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
        invalidCount,
        duplicateCount: duplicates.length,
        duplicates: duplicates.slice(0, 500),
        ...(errors.length && { errors: errors.slice(0, 5) }),
      },
    });

    await emitImportCompleted(io, {
      type: 'company',
      uploaderName: uploader.name || 'Unknown user',
      totalImported: inserted,
      companyCount: inserted,
      status: 'success',
      message: `${uploader.name || 'A user'} imported ${inserted} companies`,
    });

    return job;
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
    const io = req.app.get('io');
    runImportJob(job, { buffer: req.file.buffer, uploader, io });
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