
import ExcelJS from 'exceljs';
import { randomUUID } from 'crypto';

import Company from '../models/Company.js';
import { emitImportCompleted } from '../utils/importNotifications.js';
import {
  COMPANY_COLUMN_MAP as COLUMN_MAP,
  normalizeCompanyHeader as normalizeHeader,
} from '../utils/companyImportFields.js';

// =====================================================
// EXCEL COLUMN MAPPING
// Excel header -> MongoDB Company field
// =====================================================

const TEMPLATE_HEADERS = [
  'Organization ID',
  'Company Name',
  'Company Logo',
  'Email Format',
  'FAX',
  'Headquarter Phone',
  'Address 1',
  'Address 2',
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
  'Annual Revenue',
  'Revenue Link',
  'Competitors',
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
const RAW_COMPANY_COLLECTION = 'raw_Company';

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
  const headersByColumn = {};

  sheet.getRow(1).eachCell(
    { includeEmpty: false },
    (cell, colNumber) => {
      const originalHeader = clean(getExcelValue(cell));
      const header = normalizeHeader(originalHeader);

      const field = COLUMN_MAP[header];

      if (field) {
        colToField[colNumber] = field;
      }
      if (originalHeader) {
        headersByColumn[colNumber] = originalHeader;
      }
    }
  );

  // Company Name is mandatory
  if (!Object.values(colToField).includes('name')) {
    return {
      rows: [],
      missingName: true,
      worksheetName: sheet.name,
    };
  }

  const rows = [];

  sheet.eachRow(
    { includeEmpty: false },
    (row, rowNumber) => {
      if (rowNumber === 1) return;

      const company = {};
      const rawData = Object.entries(headersByColumn).map(
        ([columnNumber, column]) => {
          const value = row.getCell(Number(columnNumber)).value ?? null;
          return {
            column,
            value,
          };
        },
      );
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
        rows.push({
          company,
          rowNumber,
          rawData,
        });
      }
    }
  );

  return {
    rows,
    missingName: false,
    worksheetName: sheet.name,
  };
}

const isDisqualified = (qcStatus) =>
  String(qcStatus || '').trim().toLowerCase() === 'disqualified';

const organizationKey = (value) => keyOf(value);

const comparableValue = (value) =>
  String(value ?? '').trim();

const rawOrganizationKey = (rawData) => {
  const organizationCell = (rawData || []).find(
    ({ column }) =>
      COLUMN_MAP[normalizeHeader(column)] === 'organizationId',
  );
  return organizationCell ? organizationKey(organizationCell.value) : '';
};

const rawCellValue = (cell) => {
  const value = cell?.value;
  if (value && typeof value === 'object') {
    if (value.text != null) return String(value.text).trim();
    if (value.result != null) return String(value.result).trim();
  }
  return comparableValue(value);
};

const mergeRawData = (existingRawData, incomingRawData) => {
  const rawData = (existingRawData || []).map((cell) => ({ ...cell }));
  const changes = [];

  for (const incomingCell of incomingRawData || []) {
    const normalizedHeader = normalizeHeader(incomingCell.column);
    const mappedField = COLUMN_MAP[normalizedHeader];
    if (!normalizedHeader || incomingCell.value == null || incomingCell.value === '') {
      continue;
    }

    const existingIndex = rawData.findIndex(
      (cell) => {
        const existingHeader = normalizeHeader(cell.column);
        const existingField = COLUMN_MAP[existingHeader];
        return mappedField
          ? existingField === mappedField
          : existingHeader === normalizedHeader;
      },
    );
    if (existingIndex < 0) {
      rawData.push({ ...incomingCell });
      changes.push({
        field: incomingCell.column,
        from: '',
        to: rawCellValue(incomingCell),
      });
      continue;
    }

    const currentCell = rawData[existingIndex];
    if (rawCellValue(currentCell) === rawCellValue(incomingCell)) continue;

    changes.push({
      field: currentCell.column || incomingCell.column,
      from: rawCellValue(currentCell),
      to: rawCellValue(incomingCell),
    });
    rawData[existingIndex] = {
      ...currentCell,
      value: incomingCell.value,
    };
  }

  return { rawData, changes };
};

async function saveDisqualifiedRows(
  entries,
  { importId, fileName, worksheetName, uploader, onChunk },
) {
  if (!entries.length) return null;

  const importedAt = new Date();
  const documents = entries.map(({ rawData, rowNumber }) => ({
    rawData,
    _rawImport: {
      importId,
      resource: 'company',
      sourceFile: fileName,
      worksheet: worksheetName,
      rowNumber,
      uploadedBy: String(uploader.id),
      uploadedByName: uploader.name,
      importedAt,
    },
  }));
  const collection = Company.db.collection(RAW_COMPANY_COLLECTION);

  let processed = 0;
  for (const part of chunk(documents, INSERT_CHUNK)) {
    await collection.insertMany(part, { ordered: true });
    processed += part.length;
    onChunk?.(processed);
  }

  return importId;
}

async function findExistingByOrganizationId(organizationIds) {
  const existing = new Map();
  const values = [...new Set(organizationIds.map(clean).filter(Boolean))];

  for (const part of chunk(values, LOOKUP_CHUNK)) {
    const docs = await Company.find(
      {
        organizationId: {
          $in: part.map(
            (value) =>
              new RegExp(
                `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
                'i',
              ),
          ),
        },
      },
      { organizationId: 1, name: 1, country: 1, nameKey: 1 },
    ).lean();

    for (const doc of docs) {
      const key = organizationKey(doc.organizationId);
      if (key && !existing.has(key)) existing.set(key, doc);
    }
  }

  return existing;
}

async function findRawByOrganizationId(organizationIds) {
  const collection = Company.db.collection(RAW_COMPANY_COLLECTION);
  const existing = new Map();
  const values = [...new Set(organizationIds.map(clean).filter(Boolean))];
  const queryValues = values.flatMap((value) => {
    const numericValue = Number(value);
    const stringValue = new RegExp(
      `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
      'i',
    );
    return Number.isSafeInteger(numericValue)
      ? [stringValue, numericValue]
      : [stringValue];
  });
  const headerPattern = /^(organization[\s_-]*id|org[\s_-]*id)$/i;

  for (const part of chunk(queryValues, LOOKUP_CHUNK)) {
    const docs = await collection
      .find({
        rawData: {
          $elemMatch: {
            column: { $regex: headerPattern },
            value: { $in: part },
          },
        },
      })
      .toArray();

    for (const doc of docs) {
      const rawKey = rawOrganizationKey(doc.rawData);
      const matchedId = values.find((value) => {
        if (organizationKey(value) === rawKey) return true;
        const requestedNumber = Number(value);
        const existingNumber = Number(rawKey);
        return (
          Number.isSafeInteger(requestedNumber) &&
          Number.isSafeInteger(existingNumber) &&
          requestedNumber === existingNumber
        );
      });
      const key = organizationKey(matchedId);
      if (key && !existing.has(key)) existing.set(key, doc);
    }
  }

  return existing;
}

async function updateExistingRows(updates, onChunk) {
  if (!updates.length) return 0;

  let processed = 0;
  for (const part of chunk(updates, INSERT_CHUNK)) {
    await Company.bulkWrite(
      part.map(({ id, fields }) => ({
        updateOne: {
          filter: { _id: id },
          update: { $set: fields },
        },
      })),
      { ordered: true },
    );
    processed += part.length;
    onChunk?.(processed);
  }

  return updates.length;
}

async function updateExistingRawRows(updates) {
  if (!updates.length) return;

  const collection = Company.db.collection(RAW_COMPANY_COLLECTION);
  for (const part of chunk(updates, INSERT_CHUNK)) {
    await collection.bulkWrite(
      part.map(({ id, rawData }) => ({
        updateOne: {
          filter: { _id: id },
          update: { $set: { rawData } },
        },
      })),
      { ordered: true },
    );
  }
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
    fileName,
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
      worksheetName,
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
    const disqualifiedImportId = randomUUID();

    // Step 2: Validate company names
    const rows = [];
    const disqualifiedRows = [];

    let invalidCount = 0;

    for (const entry of parsed) {
      const { company } = entry;
      if (isDisqualified(company.qcStatus)) {
        disqualifiedRows.push(entry);
        continue;
      }

      if (!company.name && !company.organizationId) {
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

    if (!rows.length && !disqualifiedRows.length) {
      return updateJob(job, {
        state: 'failed',
        error: 'No valid company names found in the Excel file.',
      });
    }

    updateJob(job, {
      percent: 10,
      totalRows: parsed.length,
    });

    // Step 3: Match existing records by Organization ID.
    updateJob(job, {
      stage: 'Checking Organization IDs',
      processed: null,
      total: null,
    });

    const organizationIds = parsed
      .map(({ company }) => company.organizationId)
      .filter(Boolean);
    const [existingCompanies, existingRawRows] = await Promise.all([
      findExistingByOrganizationId(organizationIds),
      findRawByOrganizationId(organizationIds),
    ]);

    const rawUpdates = new Map();
    const changedRecords = new Map();
    const rawInsertEntries = [];
    for (const entry of parsed) {
      const { company, rawData } = entry;
      const organizationId = company.organizationId || '';
      const key = organizationKey(organizationId);
      if (key && existingRawRows.has(key)) {
        const existingRaw = existingRawRows.get(key);
        const current = rawUpdates.get(String(existingRaw._id));
        const merged = mergeRawData(
          current?.rawData || existingRaw.rawData,
          rawData,
        );
        if (merged.changes.length || current) {
          rawUpdates.set(String(existingRaw._id), {
            id: existingRaw._id,
            rawData: merged.rawData,
          });
        }
        if (merged.changes.length) {
          const record = changedRecords.get(key) || {
            organizationId,
            company: [],
            rawCompanies: [],
          };
          record.rawCompanies.push(...merged.changes);
          changedRecords.set(key, record);
        }
      } else if (isDisqualified(company.qcStatus)) {
        rawInsertEntries.push(entry);
      }
    }

    if (rawInsertEntries.length) {
      await saveDisqualifiedRows(rawInsertEntries, {
        importId: disqualifiedImportId,
        fileName,
        worksheetName,
        uploader,
      });
    }
    const existingCompanyUpdates = new Map();
    const updateCompanyChanges = new Map();
    const newRows = [];
    for (const row of rows) {
      const key = organizationKey(row.organizationId);
      if (!key || !existingCompanies.has(key)) {
        if (!row.name) {
          invalidCount++;
          continue;
        }
        newRows.push(row);
        continue;
      }

      const existing = existingCompanies.get(key);
      const currentUpdate = existingCompanyUpdates.get(String(existing._id));
      const fields = { ...(currentUpdate?.fields || {}) };
      const changes = [];
      for (const [field, value] of Object.entries(row)) {
        if (value === '' || value == null) continue;
        if (['nameKey', 'uploadedBy', 'uploadedByName', 'importBatchId'].includes(field)) {
          continue;
        }
        const oldValue = fields[field] !== undefined ? fields[field] : existing[field];
        if (comparableValue(oldValue) !== comparableValue(value)) {
          changes.push({ field, from: comparableValue(oldValue), to: comparableValue(value) });
        }
        fields[field] = value;
      }
      fields.nameKey = keyOf(fields.name || existing.name);
      fields.uploadedBy = uploader.id;
      fields.uploadedByName = uploader.name;
      fields.importBatchId = importBatchId;
      if (changes.length) {
        existingCompanyUpdates.set(String(existing._id), {
          id: existing._id,
          fields,
        });
        const record = changedRecords.get(key) || {
          organizationId: row.organizationId,
          company: [],
          rawCompanies: [],
        };
        record.company.push(...changes);
        changedRecords.set(key, record);
        updateCompanyChanges.set(String(existing._id), key);
      } else if (currentUpdate) {
        existingCompanyUpdates.set(String(existing._id), {
          id: existing._id,
          fields,
        });
      }
    }

    // Step 4: Check duplicates for new companies only.
    const names = [
      ...new Set(
        newRows.map((row) => row.nameKey)
      ),
    ];

    const existing = await findExisting(names);

    // Step 4: Check duplicates inside Excel
    const seen = new Set();
    const seenOrganizationIds = new Set();

    const uniqueRows = [];
    const duplicates = [];

    for (const row of newRows) {
      const key = dupKey(
        row.name,
        row.country
      );
      const organizationId = organizationKey(row.organizationId);

      const inDb = existing.has(key);
      const duplicateOrganizationId =
        organizationId && seenOrganizationIds.has(organizationId);
      const inFile = seen.has(key) || duplicateOrganizationId;

      if (inDb || inFile) {
        duplicates.push({
          name: row.name,
          country: row.country || '',
          emailAddress: row.emailAddress || '',
          organizationId: row.organizationId || '',
          reason: duplicateOrganizationId
            ? 'Duplicate Organization ID in uploaded Excel'
            : `${inDb ? 'Already exists in database' : 'Duplicate row in uploaded Excel'} (same company name and country)`,
        });

        continue;
      }

      uniqueRows.push(row);

      seen.add(key);
      if (organizationId) seenOrganizationIds.add(organizationId);
    }

    const updatedCompanyCount = await updateExistingRows(
      [...existingCompanyUpdates.values()],
    );
    await updateExistingRawRows([...rawUpdates.values()]);

    // Step 5: Save companies
    updateJob(job, {
      stage: 'Saving rows',
      percent: 30,
      processed: 0,
      total: uniqueRows.length + updatedCompanyCount,
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
            done + updatedCompanyCount,
            uniqueRows.length + updatedCompanyCount
          ),
        });
      }
    );

    // Step 6: Complete import
    const failedCount = uniqueRows.length - inserted;
    const updatedCount = updateCompanyChanges.size;
    const changedFields = [...changedRecords.values()]
      .filter((record) => record.company.length || record.rawCompanies.length)
      .slice(0, 500);
    const changedFieldsTotal = [...changedRecords.values()].filter(
      (record) => record.company.length || record.rawCompanies.length,
    ).length;

    updateJob(job, {
      state: 'done',
      stage: 'Completed',
      percent: 100,
      processed: uniqueRows.length + updatedCount,

      result: {
        message:
          updatedCount || rawUpdates.size
            ? `Import complete. Updated ${updatedCount} Company records and ${rawUpdates.size} Raw Companies rows with matching Organization IDs.`
            : 'Import complete. No existing records required changes for the Organization IDs in this file.',

        importBatchId,

        uploadedBy: uploader.id,
        uploadedByName: uploader.name,

        totalRows: parsed.length,

        importedCount: inserted,
        updatedCount,
        updatedRawCount: rawUpdates.size,
        failedCount,
        invalidCount,
        duplicateCount: duplicates.length,
        disqualifiedCount: disqualifiedRows.length,
        disqualifiedImportId:
          rawInsertEntries.length ? disqualifiedImportId : null,

        duplicates: duplicates.slice(0, 500),
        disqualifiedRows: disqualifiedRows.slice(0, 500).map(({ company }) => ({
          name: company.name || '',
          emailAddress: company.emailAddress || '',
          qcStatus: company.qcStatus || '',
          reason: 'Disqualified QC status — saved to Raw Companies',
        })),
        changedFields,
        changedFieldsTotal,

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

      totalImported: inserted + updatedCount,
      companyCount: inserted + updatedCount,

      status: 'success',

      message: `${
        uploader.name || 'A user'
      } imported ${inserted} companies and updated ${updatedCount}`,
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
      fileName: req.file.originalname,
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