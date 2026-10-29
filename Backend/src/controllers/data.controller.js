import ExcelJS from "exceljs";
import * as svc from "../services/data.service.js";
import Prospect from "../models/Prospect.js";
import { randomUUID } from "crypto";
import User from '../models/User.js';
import mongoose from 'mongoose';

import { emitImportCompleted } from '../utils/importNotifications.js';
/* ====================================================================
   Excel header -> Prospect schema field
   ==================================================================== */
const PROSPECT_COLUMN_MAP = {
  "employee code": "employeeCode",
  "employee name": "employeeName",
  date: "date",
  campaign: "campaign",

  "first name": "firstName",
  "last name": "lastName",
  "company name": "companyName",
  "email address": "emailAddress",
  "specific title": "specificTitle",
  "job level": "jobLevel",
  "job role": "jobRole",
  "phone number": "phoneNumber",

  "address 1": "address1",
  "address 2": "address2",
  city: "city",
  state: "state",
  zipcode: "zipcode",
  country: "country",

  "main industry": "mainIndustry",
  industry: "industry",
  "sub industry": "industry",
  "see all employee size": "seeAllEmployeeSize",
  "employee size": "employeeSize",
  "exact revenue": "exactRevenue",
  revenue: "revenue",

  "company domain": "companyDomain",
  website: "website",
  "company linkedin url": "companyLinkedinUrl",
  "linkedin profile link": "linkedinProfileLink",
  "linkedin profile link sn": "linkedinProfileLinkSN",
  "revenue link": "revenueLink",

  "sic code": "sicCode",
  "naics code": "naicsCode",
  "prospect tenure": "prospectTenure",
  "ra comments": "raComment",
  "ra comment": "raComment",
  "address link": "addressLink",
  "call notes": "callNotes",
  dispositions: "dispositions",

  note1: "note1",
  note2: "note2",
  note3: "note3",

  status: "status",
  "primary reason": "primaryReason",
  "qa comment": "qaComment",
  "ebb status": "ebbStatus",
  "auditor name": "auditorName",
  "audit date": "auditDate",
};




const EMPTY_STATS = { total: 0, qualified: 0, disqualified: 0 };
const LIST_LIMIT = 200;

export const getProspectDashboardStats = async (req, res, next) => {
  try {
    const { userId, includeLists } = req.query;

    if (userId && !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID',
      });
    }

    // ONE aggregation instead of two: group by uploadedBy (null included).
    // Global totals are derived from these rows in JS, so Prospect is scanned once.
    const [countRows, users] = await Promise.all([
      Prospect.aggregate([
        {
          $group: {
            _id: '$uploadedBy',
            total: { $sum: 1 },
            qualified: {
              $sum: { $cond: [{ $eq: ['$status', 'Qualified'] }, 1, 0] },
            },
            disqualified: {
              $sum: { $cond: [{ $eq: ['$status', 'DisQualified'] }, 1, 0] },
            },
          },
        },
      ]),
      User.find().select('_id name email').sort({ name: 1 }).lean(),
    ]);

    const global = { ...EMPTY_STATS };
    const countsByUser = new Map();

    for (const row of countRows) {
      global.total += row.total;
      global.qualified += row.qualified;
      global.disqualified += row.disqualified;

      // Rows without uploadedBy count toward global only
      if (row._id) {
        countsByUser.set(row._id.toString(), {
          total: row.total,
          qualified: row.qualified,
          disqualified: row.disqualified,
        });
      }
    }

    const userList = users.map((user) => ({
      _id: user._id,
      name: user.name || user.email || 'Unnamed user',
      email: user.email || '',
      stats: countsByUser.get(user._id.toString()) || { ...EMPTY_STATS },
    }));

    let selectedUser = null;
    let selectedStats = global;
    let qualifiedList = [];
    let disqualifiedList = [];

    if (userId) {
      selectedUser =
        userList.find((user) => user._id.toString() === userId) || null;

      if (!selectedUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      selectedStats = selectedUser.stats;

      // The dashboard UI only needs counts. Fetch the lists only when asked
      // (?includeLists=true), capped and without heavy fields.
      if (includeLists === 'true') {
        const listQuery = (status) =>
          Prospect.find({ uploadedBy: userId, status })
            .sort({ createdAt: -1 })
            .limit(LIST_LIMIT)
            .lean();

        [qualifiedList, disqualifiedList] = await Promise.all([
          listQuery('Qualified'),
          listQuery('DisQualified'),
        ]);
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        global,
        selectedUser,
        stats: selectedStats,
        users: userList,
        qualifiedList,
        disqualifiedList,
      },
    });
  } catch (error) {
    next(error);
  }
};
export const getDashboard = async (req, res, next) => {
  try {
    console.log(" function call")
    const data = await svc.getDashboard(req.query);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};
/* ====================================================================
   Generic CRUD handlers
   ==================================================================== */
const wrap = (fn) => async (req, res, next) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    next(e);
  }
};

// req.query carries page, limit, search, sortBy, sortOrder and filters.
export const getAll = wrap((req) => svc.list(req.params.resource, req.query));


export const add = wrap((req) => svc.create(req.params.resource, req.body));

export const edit = wrap((req) =>
  svc.update(req.params.resource, req.params.id, req.body),
);

export const del = wrap(async (req) => {
  await svc.remove(req.params.resource, req.params.id);
  return { ok: true };
});

// Distinct values for the column filter checklist.
export const distinctValues = wrap((req) =>
  svc.distinct(req.params.resource, req.params.field, req.query),
);

/* ====================================================================
   Excel export (streams .xlsx, respects search + sort + column filters)
   ==================================================================== */

const MAX_EXPORT_ROWS = 100000;

const toCell = (value) => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value;
  if (typeof value === "object") return JSON.stringify(value);
  return value;
};

export const exportExcel = async (req, res, next) => {
  const { resource } = req.params;
  let cursor;

  try {
    // Columns the user currently sees: [{ key, name }]
    let requested = [];
    try {
      requested = JSON.parse(req.query.columns || "[]");
    } catch {
      requested = [];
    }

    let columns = (Array.isArray(requested) ? requested : [])
      .filter((c) => c && typeof c.key === "string" && c.key)
      .slice(0, 100)
      .map((c) => ({ key: c.key, name: String(c.name || c.key) }));

    let dbFields = columns.map((c) => svc.fieldFor(resource, c.key));
    let first = null;

    if (columns.length > 0) {
      // Projection: only the visible columns are read from MongoDB.
      cursor = svc.exportCursor(resource, req.query, dbFields);
    } else {
      // No columns sent: read everything and use the first record's keys.
      cursor = svc.exportCursor(resource, req.query);
      first = await cursor.next();
      columns = Object.keys(first || {})
        .filter((k) => !["_id", "__v"].includes(k))
        .map((k) => ({ key: k, name: k }));
      dbFields = columns.map((c) => svc.fieldFor(resource, c.key));
    }

    const stamp = new Date().toISOString().slice(0, 10);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${resource}-${stamp}.xlsx"`,
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Accel-Buffering", "no"); // stops nginx from buffering the stream

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: res,
      useStyles: true,
      useSharedStrings: false,
      zip: { zlib: { level: 1 } }, // fast compression
    });

    const sheet = workbook.addWorksheet(resource, {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    sheet.columns = columns.map((c) => ({
      width: Math.min(40, Math.max(14, c.name.length + 4)),
    }));
    sheet.autoFilter = { from: "A1", to: { row: 1, column: columns.length } };

    const header = sheet.addRow(columns.map((c) => c.name));
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" },
    };
    header.commit();

    // Array rows are faster than keyed-object rows.
    const writeRow = (doc) => {
      const values = new Array(dbFields.length);
      for (let i = 0; i < dbFields.length; i++) {
        values[i] = toCell(doc[dbFields[i]]);
      }
      sheet.addRow(values).commit();
    };

    // Stop reading if the browser cancels the download.
    let closed = false;
    res.on("close", () => {
      closed = true;
    });

    let count = 0;
    if (first) {
      writeRow(first);
      count += 1;
    }
    for await (const doc of cursor) {
      if (closed || count >= MAX_EXPORT_ROWS) break;
      writeRow(doc);
      count += 1;
    }

    await sheet.commit();
    await workbook.commit();
  } catch (e) {
    if (cursor) cursor.close().catch(() => {});
    if (res.headersSent) res.destroy(e);
    else next(e);
  }
};
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const exportJobs = new Map();
const EXPORT_TTL_MS = 15 * 60 * 1000;

const cleanupJob = (id) => {
  const job = exportJobs.get(id);
  if (job?.file) fs.promises.unlink(job.file).catch(() => {});
  exportJobs.delete(id);
};

const parseColumns = (raw) => {
  let requested = [];
  try {
    requested = JSON.parse(raw || "[]");
  } catch {
    requested = [];
  }
  return (Array.isArray(requested) ? requested : [])
    .filter((c) => c && typeof c.key === "string" && c.key)
    .slice(0, 100)
    .map((c) => ({ key: c.key, name: String(c.name || c.key) }));
};

async function buildExportFile(job, resource, query) {
  let cursor;
  try {
    let columns = parseColumns(query.columns);
    let dbFields = columns.map((c) => svc.fieldFor(resource, c.key));
    let first = null;

    if (columns.length) {
      cursor = svc.exportCursor(resource, query, dbFields);
    } else {
      cursor = svc.exportCursor(resource, query);
      first = await cursor.next();
      columns = Object.keys(first || {})
        .filter((k) => !["_id", "__v"].includes(k))
        .map((k) => ({ key: k, name: k }));
      dbFields = columns.map((c) => svc.fieldFor(resource, c.key));
    }

    const file = path.join(os.tmpdir(), `export-${job.id}.xlsx`);
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: file,
      useStyles: true,
      useSharedStrings: false,
      zip: { zlib: { level: 1 } },
    });
    const sheet = workbook.addWorksheet(resource, {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    sheet.columns = columns.map((c) => ({
      width: Math.min(40, Math.max(14, c.name.length + 4)),
    }));
    sheet.autoFilter = { from: "A1", to: { row: 1, column: columns.length } };

    const header = sheet.addRow(columns.map((c) => c.name));
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" },
    };
    header.commit();

    const writeRow = (doc) => {
      const values = new Array(dbFields.length);
      for (let i = 0; i < dbFields.length; i++) {
        values[i] = toCell(doc[dbFields[i]]);
      }
      sheet.addRow(values).commit();
    };

    let count = 0;
    if (first) {
      writeRow(first);
      count += 1;
    }
    for await (const doc of cursor) {
      if (count >= MAX_EXPORT_ROWS) break;
      writeRow(doc);
      count += 1;
      if (count % 500 === 0) job.processed = count;
    }

    await sheet.commit();
    await workbook.commit();

    job.processed = count;
    job.file = file;
    job.fileName = `${resource}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    job.state = "done";
  } catch (e) {
    if (cursor) cursor.close().catch(() => {});
    job.state = "failed";
    job.error = e.message || "Export failed.";
  } finally {
    setTimeout(() => cleanupJob(job.id), EXPORT_TTL_MS).unref?.();
  }
}

export const startExport = (req, res) => {
  const job = {
    id: randomUUID(),
    userId: String(req.user?._id || req.user?.id || ""),
    state: "running",
    processed: 0,
    file: null,
    fileName: "",
    error: null,
  };
  exportJobs.set(job.id, job);

  res.status(202).json({ jobId: job.id });

  // Not awaited: the response is already sent.
  buildExportFile(job, req.params.resource, req.query);
};

const ownJob = (req) => {
  const job = exportJobs.get(req.params.jobId);
  const uid = String(req.user?._id || req.user?.id || "");
  return job && job.userId === uid ? job : null;
};

export const exportStatus = (req, res) => {
  const job = ownJob(req);
  if (!job) {
    return res.status(404).json({ message: "Export not found or expired." });
  }
  res.json({ state: job.state, processed: job.processed, error: job.error });
};

export const exportFile = (req, res) => {
  const job = ownJob(req);
  if (!job || job.state !== "done" || !job.file) {
    return res.status(404).json({ message: "Export not ready or expired." });
  }
  res.download(job.file, job.fileName);
};

/* ====================================================================
   Excel import (Prospects)
   ==================================================================== */
const ALLOWED_STATUSES = ["Qualified", "DisQualified"];
const INSERT_CHUNK = 1000;
const LOOKUP_CHUNK = 5000;
const importJobs = new Map();
const JOB_TTL_MS = 30 * 60 * 1000;
const updateJob = (job, patch) =>
  Object.assign(job, patch, { updatedAt: Date.now() });
const scale = (from, to, done, total) =>
  total > 0 ? Math.round(from + ((to - from) * done) / total) : to;

const normalizeHeader = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const normalizeEmail = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const normalizeLinkedIn = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\/+$/, "");

function getExcelValue(cell) {
  const value = cell.value;

  if (value == null) return "";

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "object") {
    if (value.hyperlink) return value.hyperlink;
    if (value.richText) {
      return value.richText.map((part) => part.text).join("");
    }
    if (value.text != null) return value.text;
    if (value.result != null) return value.result;
    return "";
  }

  return value;
}

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// ordered:false keeps going on bad rows; a BulkWriteError still reports what got in.
const insertInChunks = async (docs, onChunk) => {
  let inserted = 0;
  let done = 0;
  const errors = [];

  for (const part of chunk(docs, INSERT_CHUNK)) {
    try {
      const res = await Prospect.insertMany(part, { ordered: false });
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

// Reads the first sheet and maps headers -> schema fields.
async function parseProspectsFromBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  // Header row -> { colNumber: fieldName }
  const colToField = {};
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const field = PROSPECT_COLUMN_MAP[normalizeHeader(getExcelValue(cell))];
    if (field) colToField[colNumber] = field;
  });

  if (!Object.keys(colToField).length) return [];

  const prospects = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const prospect = {};
    let hasData = false;

    for (const [colNumber, field] of Object.entries(colToField)) {
      let value = getExcelValue(row.getCell(Number(colNumber)));
      if (typeof value === "string") value = value.trim();
      if (field === "emailAddress") {
        value = String(value).replace(/^mailto:/i, "");
      }
      if (value !== "" && value != null) {
        prospect[field] = String(value);
        hasData = true;
      }
    }

    if (hasData) prospects.push(prospect);
  });

  return prospects;
}

// Looks up existing prospects in batches so huge $in lists stay fast.
async function findExisting(emails, linkedinUrls, onStep) {
  const existingEmails = new Set();
  const existingLinkedIn = new Set();

  const emailParts = chunk(emails, LOOKUP_CHUNK);
  const urlParts = chunk(linkedinUrls, LOOKUP_CHUNK);
  const totalSteps = emailParts.length + urlParts.length;
  let step = 0;

  for (const part of emailParts) {
    const docs = await Prospect.find(
      { emailAddress: { $in: part } },
      { emailAddress: 1 },
    ).lean();
    docs.forEach((d) => existingEmails.add(normalizeEmail(d.emailAddress)));
    onStep?.(++step, totalSteps);
  }

  for (const part of urlParts) {
    const docs = await Prospect.find(
      { linkedinProfileLink: { $in: part } },
      { linkedinProfileLink: 1 },
    ).lean();
    docs.forEach((d) =>
      existingLinkedIn.add(normalizeLinkedIn(d.linkedinProfileLink)),
    );
    onStep?.(++step, totalSteps);
  }

  return { existingEmails, existingLinkedIn };
}

// Adjust to your auth middleware: it must expose the logged-in user's id and display name.
const getUploader = (req) => {
  const u = req.user || {};
  return {
    id: u._id || u.id || u.userId || null,
    name: u.name || u.fullName || u.employeeName || u.username || "",
    code: u.employeeCode || "",
  };
};

async function runImportJob(
  job,
  { buffer, selectedStatus, uploader, io }
) {
  try {
    updateJob(job, {
      stage: "Reading file",
      percent: 3,
      processed: null,
      total: null,
    });

    const parsed = await parseProspectsFromBuffer(buffer);
    if (!parsed.length) {
      return updateJob(job, {
        state: "failed",
        error: "No valid rows or recognised column headers found in the file.",
      });
    }

    const importBatchId = randomUUID();

    const rows = parsed.map((p) => ({
      ...p,
      employeeName: p.employeeName || uploader.name,
      employeeCode: p.employeeCode || uploader.code,
      status: selectedStatus,
      uploadedBy: uploader.id,
      uploadedByName: uploader.name,
      importBatchId,
      emailAddress: normalizeEmail(p.emailAddress),
      linkedinProfileLink: normalizeLinkedIn(p.linkedinProfileLink),
    }));

    updateJob(job, { percent: 10, totalRows: rows.length });

    const summary = {
      selectedStatus,
      importBatchId,
      uploadedBy: uploader.id,
      employeeName: uploader.name,
      totalRows: rows.length,
    };

    /* ---------- DisQualified: no duplicate check ---------- */
    if (selectedStatus === "DisQualified") {
      updateJob(job, {
        stage: "Saving rows",
        processed: 0,
        total: rows.length,
      });

      const { inserted, errors } = await insertInChunks(rows, (done) =>
        updateJob(job, {
          processed: done,
          percent: scale(10, 99, done, rows.length),
        }),
      );

      updateJob(job, {
  state: 'done',
  percent: 100,
  processed: rows.length,
  result: {
    message: 'DisQualified Excel import completed.',
    ...summary,
    importedCount: inserted,
    failedCount: rows.length - inserted,
    duplicateCheckPerformed: false,
    ...(errors.length && { errors: errors.slice(0, 5) }),
  },
});

await emitImportCompleted(io, {
  type: 'prospect',
  uploaderName: uploader.name || 'Unknown user',
  totalImported: inserted,
  qualifiedCount: 0,
  disqualifiedCount: inserted,
  status: 'success',
  message: `${uploader.name || 'A user'} imported ${inserted} DisQualified prospects`,
});

return job;
    }

    /* ---------- Qualified: skip duplicates ---------- */
    updateJob(job, {
      stage: "Checking duplicates",
      processed: null,
      total: null,
    });

    const emails = [
      ...new Set(rows.map((p) => p.emailAddress).filter(Boolean)),
    ];
    const linkedinUrls = [
      ...new Set(rows.map((p) => p.linkedinProfileLink).filter(Boolean)),
    ];

    const { existingEmails, existingLinkedIn } = await findExisting(
      emails,
      linkedinUrls,
      (done, total) => updateJob(job, { percent: scale(10, 30, done, total) }),
    );

    const seenEmails = new Set();
    const seenLinkedIn = new Set();
    const uniqueRows = [];
    const duplicates = [];

    for (const row of rows) {
      const email = row.emailAddress;
      const linkedin = row.linkedinProfileLink;

      const inDb =
        (email && existingEmails.has(email)) ||
        (linkedin && existingLinkedIn.has(linkedin));
      const inFile =
        (email && seenEmails.has(email)) ||
        (linkedin && seenLinkedIn.has(linkedin));

      if (inDb || inFile) {
        duplicates.push({
          firstName: row.firstName || "",
          lastName: row.lastName || "",
          emailAddress: email,
          linkedinProfileLink: linkedin,
          reason: inDb
            ? "Already exists in database"
            : "Duplicate row in uploaded Excel",
        });
        continue;
      }

      uniqueRows.push(row);
      if (email) seenEmails.add(email);
      if (linkedin) seenLinkedIn.add(linkedin);
    }

    updateJob(job, {
      stage: "Saving rows",
      percent: 30,
      processed: 0,
      total: uniqueRows.length,
    });

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
    message: 'Qualified Excel import completed.',
    ...summary,
    importedCount: inserted,
    failedCount: uniqueRows.length - inserted,
    duplicateCount: duplicates.length,
    duplicateCheckPerformed: true,
    duplicates: duplicates.slice(0, 500),
    ...(errors.length && { errors: errors.slice(0, 5) }),
  },
});

await emitImportCompleted(io, {
  type: 'prospect',
  uploaderName: uploader.name || 'Unknown user',
  totalImported: inserted,
  qualifiedCount: inserted,
  disqualifiedCount: 0,
  status: 'success',
  message: `${uploader.name || 'A user'} imported ${inserted} Qualified prospects`,
});

return job;
  } catch (err) {
    return updateJob(job, {
      state: "failed",
      error: err.message || "Import failed.",
    });
  }
}

export async function importProspectsExcel(req, res, next) {
  try {
    const selectedStatus = String(req.body.status || "").trim();

    if (!ALLOWED_STATUSES.includes(selectedStatus)) {
      return res.status(400).json({
        message: "Select Qualified or DisQualified before uploading.",
      });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Please upload an Excel file." });
    }

    const uploader = getUploader(req);
    if (!uploader.id) {
      return res
        .status(401)
        .json({ message: "Could not identify the uploading user." });
    }
    if (!uploader.name) {
      const u = await User.findById(uploader.id).select("name email").lean();
      uploader.name = u?.name || u?.email || "";
    }
    const sentUploadedBy = String(req.body.uploadedBy || "").trim();
    if (sentUploadedBy && sentUploadedBy !== String(uploader.id)) {
      return res
        .status(403)
        .json({ message: "Uploader does not match the logged-in user." });
    }
    const job = {
      id: randomUUID(),
      userId: String(uploader.id),
      state: "running", // running | done | failed
      stage: "Queued",
      percent: 0,
      processed: null,
      total: null,
      totalRows: 0,
      result: null,
      error: null,
      updatedAt: Date.now(),
    };

    importJobs.set(job.id, job);
    setTimeout(() => importJobs.delete(job.id), JOB_TTL_MS).unref?.();

    res.status(202).json({ jobId: job.id });

    // Not awaited on purpose: the response is already sent.
  const io = req.app.get('io');

runImportJob(job, {
  buffer: req.file.buffer,
  selectedStatus,
  uploader,
  io,
});
  } catch (error) {
    next(error);
  }
}

export function getImportStatus(req, res) {
  const job = importJobs.get(req.params.jobId);
  const uploader = getUploader(req);

  // Only the user who started the import can see it.
  if (!job || String(uploader.id) !== job.userId) {
    return res.status(404).json({
      message:
        "Import job not found. It may have expired or the server restarted.",
    });
  }

  const { id, userId, ...status } = job;
  return res.json(status);
}


/* ====================================================================
   Company list filter (upload Excel of domains / company names)
   ==================================================================== */
const COMPANY_LIST_TTL_MS = 60 * 60 * 1000;
const MAX_LIST_ITEMS = 5000;
export const companyLists = new Map(); // id -> { userId, domains, names }

const DOMAIN_HEADERS = ["company domain", "domain", "website", "company website"];
const NAME_HEADERS = ["company name", "company", "organization", "name"];

const cleanDomain = (v) =>
  String(v || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "");

export async function uploadCompanyList(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Please upload an Excel file." });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return res.status(400).json({ message: "The file is empty." });

    let domainCol = null;
    let nameCol = null;
    sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
      const h = normalizeHeader(getExcelValue(cell));
      if (!domainCol && DOMAIN_HEADERS.includes(h)) domainCol = col;
      if (!nameCol && NAME_HEADERS.includes(h)) nameCol = col;
    });

    if (!domainCol && !nameCol) {
      return res.status(400).json({
        message: 'Add a "Company Domain" and/or "Company Name" column header.',
      });
    }

    const domains = new Set();
    const names = new Set();

    sheet.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      if (domainCol) {
        const d = cleanDomain(getExcelValue(row.getCell(domainCol)));
        if (d) domains.add(d);
      }
      if (nameCol) {
        const nm = String(getExcelValue(row.getCell(nameCol)) || "").trim();
        if (nm) names.add(nm);
      }
    });

    if (domains.size + names.size === 0) {
      return res.status(400).json({ message: "No company values found." });
    }
    if (domains.size > MAX_LIST_ITEMS || names.size > MAX_LIST_ITEMS) {
      return res.status(400).json({
        message: `Too many values (max ${MAX_LIST_ITEMS} per column).`,
      });
    }

    const id = randomUUID();
    companyLists.set(id, {
      userId: String(req.user?._id || req.user?.id || ""),
      domains: [...domains],
      names: [...names],
    });
    setTimeout(() => companyLists.delete(id), COMPANY_LIST_TTL_MS).unref?.();

    res.json({
      listId: id,
      domainCount: domains.size,
      nameCount: names.size,
    });
  } catch (e) {
    next(e);
  }
}

export async function companyListSample(req, res, next) {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Company List");

    sheet.columns = [
      { header: "Company Domain", key: "domain", width: 32 },
      { header: "Company Name", key: "name", width: 32 },
    ];
    sheet.addRows([
      ["acme.com", "Acme Inc"],
      ["globex.com", "Globex Corporation"],
    ]);
    sheet.getRow(1).font = { bold: true };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="company-list-sample.xlsx"',
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    next(e);
  }
}