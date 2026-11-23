import ExcelJS from "exceljs";
import mongoose from "mongoose";
import { randomUUID } from "crypto";
import Company from "../models/Company.js";
import Prospect from "../models/Prospect.js";
import {
  COMPANY_COLUMN_MAP,
  normalizeCompanyHeader,
} from "../utils/companyImportFields.js";

const RAW_COLLECTIONS = {
  prospect: "raw_prospect",
  company: "raw_Company",
};
const INSERT_CHUNK_SIZE = 1000;
const LOOKUP_CHUNK_SIZE = 1000;
const JOB_TTL_MS = 30 * 60 * 1000;
const LINKEDIN_DISQUALIFIED_IMPORT_ID = "__linkedin_disqualified_prospects__";
const PROSPECT_RAW_FIELDS = Object.keys(Prospect.schema.paths)
  .filter((field) => !["_id", "__v"].includes(field))
  .map((field) => ({
    field,
    column: field
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/\b\w/g, (letter) => letter.toUpperCase()),
  }));
const jobs = new Map();
const getCollectionName = (resource) =>
  Object.prototype.hasOwnProperty.call(RAW_COLLECTIONS, resource)
    ? RAW_COLLECTIONS[resource]
    : null;

const updateJob = (job, patch) =>
  Object.assign(job, patch, { updatedAt: Date.now() });

const getUploader = (req) => {
  const user = req.user || {};
  return {
    id: String(user._id || user.id || user.userId || ""),
    name:
      user.name ||
      user.fullName ||
      user.employeeName ||
      user.username ||
      user.email ||
      "",
  };
};

const cellValue = (cell) => cell.value ?? null;
const normalizeOrganizationId = (value) => String(value ?? "").trim().toLowerCase();
const organizationIdsMatch = (left, right) => {
  const leftKey = normalizeOrganizationId(left);
  const rightKey = normalizeOrganizationId(right);
  if (leftKey === rightKey) return true;
  const leftNumber = Number(leftKey);
  const rightNumber = Number(rightKey);
  return (
    Number.isSafeInteger(leftNumber) &&
    Number.isSafeInteger(rightNumber) &&
    leftNumber === rightNumber
  );
};
const chunks = (items, size) => {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

const companyValue = (value) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === "object") {
    if (value.hyperlink) return String(value.hyperlink).trim();
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text || "").join("").trim();
    }
    if (value.text != null) return String(value.text).trim();
    if (value.result != null) return String(value.result).trim();
    return "";
  }
  return String(value ?? "").trim();
};

const getMappedCompanyFields = (rawData) => {
  const fields = {};
  for (const cell of rawData || []) {
    const field = COMPANY_COLUMN_MAP[normalizeCompanyHeader(cell.column)];
    if (!field || !Company.schema.path(field)) continue;
    let value = companyValue(cell.value);
    if (!value || value === "-") continue;
    if (field === "exactEmployeeSize") value = value.replace(/,/g, "");
    if (field === "emailAddress") value = value.replace(/^mailto:/i, "").toLowerCase();
    fields[field] = value;
  }
  return fields;
};

const companyOrganizationId = (rawData) =>
  (rawData || []).find(
    ({ column }) =>
      COMPANY_COLUMN_MAP[normalizeCompanyHeader(column)] === "organizationId",
  )?.value;

const rawOrganizationId = (rawData) =>
  companyValue(companyOrganizationId(rawData));

const comparableRawValue = (value) => companyValue(value);

const mergeRawCompanyData = (existingRawData, incomingRawData) => {
  const rawData = (existingRawData || []).map((cell) => ({ ...cell }));
  const changes = [];

  for (const incomingCell of incomingRawData || []) {
    if (incomingCell.value == null || incomingCell.value === "") continue;
    const incomingHeader = normalizeCompanyHeader(incomingCell.column);
    const mappedField = COMPANY_COLUMN_MAP[incomingHeader];
    const existingIndex = rawData.findIndex((cell) => {
      const existingHeader = normalizeCompanyHeader(cell.column);
      const existingField = COMPANY_COLUMN_MAP[existingHeader];
      return mappedField
        ? existingField === mappedField
        : existingHeader === incomingHeader;
    });

    if (existingIndex < 0) {
      rawData.push({ ...incomingCell });
      changes.push({
        field: incomingCell.column,
        from: "",
        to: comparableRawValue(incomingCell.value),
      });
      continue;
    }

    const currentCell = rawData[existingIndex];
    if (
      comparableRawValue(currentCell.value) ===
      comparableRawValue(incomingCell.value)
    ) {
      continue;
    }
    changes.push({
      field: currentCell.column || incomingCell.column,
      from: comparableRawValue(currentCell.value),
      to: comparableRawValue(incomingCell.value),
    });
    rawData[existingIndex] = { ...currentCell, value: incomingCell.value };
  }

  return { rawData, changes };
};

const readWorksheet = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("The Excel file does not contain a worksheet.");

  const headerRow = worksheet.getRow(1);
  const columnCount = Math.max(headerRow.cellCount, worksheet.columnCount);
  const columns = Array.from({ length: columnCount }, (_, index) =>
    String(cellValue(headerRow.getCell(index + 1)) ?? ""),
  );

  if (!columns.some((column) => column.trim())) {
    throw new Error("The first worksheet must have column headers in row 1.");
  }

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const rawData = columns.map((column, index) => ({
      column,
      value: cellValue(row.getCell(index + 1)),
    }));

    if (rawData.some(({ value }) => value !== null && value !== "")) {
      rows.push({ rowNumber, rawData });
    }
  });

  return { columns, rows, worksheetName: worksheet.name };
};

const findExistingCompaniesByOrganizationId = async (organizationIds) => {
  const values = [...new Set(organizationIds.map(companyValue).filter(Boolean))];
  const existing = new Map();
  for (const part of chunks(values, LOOKUP_CHUNK_SIZE)) {
    const records = await Company.find({
      organizationId: {
        $in: part.map(
          (value) => new RegExp(`^${escapeRegex(value)}$`, "i"),
        ),
      },
    }).lean();
    for (const record of records) {
      const match = values.find((value) =>
        organizationIdsMatch(value, record.organizationId),
      );
      if (match) {
        const key = normalizeOrganizationId(match);
        if (!existing.has(key)) existing.set(key, record);
      }
    }
  }
  return existing;
};

const findExistingRawCompaniesByOrganizationId = async (organizationIds) => {
  const values = [...new Set(organizationIds.map(companyValue).filter(Boolean))];
  const existing = new Map();
  const collection = mongoose.connection.db.collection("raw_Company");
  const queryValues = values.flatMap((value) => {
    const numericValue = Number(value);
    return Number.isSafeInteger(numericValue)
      ? [new RegExp(`^${escapeRegex(value)}$`, "i"), numericValue]
      : [new RegExp(`^${escapeRegex(value)}$`, "i")];
  });
  const organizationHeader = /^(organization[\s_-]*id|org[\s_-]*id)$/i;

  for (const part of chunks(queryValues, LOOKUP_CHUNK_SIZE)) {
    const records = await collection
      .find({
        rawData: {
          $elemMatch: {
            column: { $regex: organizationHeader },
            value: { $in: part },
          },
        },
      })
      .toArray();
    for (const record of records) {
      const recordId = rawOrganizationId(record.rawData);
      const match = values.find((value) =>
        organizationIdsMatch(value, recordId),
      );
      if (match) {
        const key = normalizeOrganizationId(match);
        if (!existing.has(key)) existing.set(key, record);
      }
    }
  }
  return existing;
};

const runRawCompanyImport = async (
  job,
  { rows, worksheetName, fileName, uploader },
) => {
  const importId = randomUUID();
  const importBatchId = randomUUID();
  const importedAt = new Date();
  const parsedRows = rows.map((row) => ({
    ...row,
    company: getMappedCompanyFields(row.rawData),
  }));
  const organizationIds = parsedRows
    .map(({ company, rawData }) => company.organizationId || rawOrganizationId(rawData))
    .filter(Boolean);

  updateJob(job, {
    stage: "Matching Organization IDs",
    percent: 15,
    processed: 0,
    totalRows: rows.length,
  });

  const [existingCompanies, existingRawCompanies] = await Promise.all([
    findExistingCompaniesByOrganizationId(organizationIds),
    findExistingRawCompaniesByOrganizationId(organizationIds),
  ]);
  const rawUpdates = new Map();
  const companyUpdates = new Map();
  const newRows = [];
  const newRowsByOrganizationId = new Map();
  const changedByOrganizationId = new Map();

  for (const [index, entry] of parsedRows.entries()) {
    const organizationId =
      entry.company.organizationId || rawOrganizationId(entry.rawData);
    const organizationKey = normalizeOrganizationId(organizationId);
    const existingRaw = organizationKey
      ? existingRawCompanies.get(organizationKey)
      : null;

    if (existingRaw) {
      const id = String(existingRaw._id);
      const current = rawUpdates.get(id);
      const merged = mergeRawCompanyData(
        current?.rawData || existingRaw.rawData,
        entry.rawData,
      );
      rawUpdates.set(id, {
        id: existingRaw._id,
        rawData: merged.rawData,
        metadata: {
          importId,
          resource: "company",
          sourceFile: fileName,
          worksheet: worksheetName,
          rowNumber: entry.rowNumber,
          uploadedBy: uploader.id,
          uploadedByName: uploader.name,
          importedAt,
        },
      });
      if (merged.changes.length) {
        const changes = changedByOrganizationId.get(organizationKey) || {
          organizationId,
          company: [],
          rawCompanies: [],
        };
        changes.rawCompanies.push(...merged.changes);
        changedByOrganizationId.set(organizationKey, changes);
      }
    } else if (organizationKey && newRowsByOrganizationId.has(organizationKey)) {
      const current = newRowsByOrganizationId.get(organizationKey);
      const merged = mergeRawCompanyData(current.rawData, entry.rawData);
      current.rawData = merged.rawData;
      current._rawImport.rowNumber = entry.rowNumber;
      if (merged.changes.length) {
        const changes = changedByOrganizationId.get(organizationKey) || {
          organizationId,
          company: [],
          rawCompanies: [],
        };
        changes.rawCompanies.push(...merged.changes);
        changedByOrganizationId.set(organizationKey, changes);
      }
    } else {
      const document = {
        rawData: entry.rawData,
        _rawImport: {
          importId,
          resource: "company",
          sourceFile: fileName,
          worksheet: worksheetName,
          rowNumber: entry.rowNumber,
          uploadedBy: uploader.id,
          uploadedByName: uploader.name,
          importedAt,
        },
      };
      newRows.push(document);
      if (organizationKey) newRowsByOrganizationId.set(organizationKey, document);
    }

    if (organizationKey && existingCompanies.has(organizationKey)) {
      const existing = existingCompanies.get(organizationKey);
      const id = String(existing._id);
      const pending = companyUpdates.get(id) || {
        id: existing._id,
        existing,
        fields: {},
        changes: [],
        hasChanges: false,
      };
      for (const [field, value] of Object.entries(entry.company)) {
        if (!value) continue;
        const previous =
          pending.fields[field] !== undefined
            ? pending.fields[field]
            : existing[field];
        if (String(previous ?? "").trim() !== String(value).trim()) {
          pending.changes.push({
            field,
            from: String(previous ?? "").trim(),
            to: String(value).trim(),
          });
        }
        pending.fields[field] = value;
      }
      if (pending.fields.name) {
        pending.fields.nameKey = pending.fields.name.trim().toLowerCase();
      }
      pending.fields.uploadedBy = uploader.id;
      pending.fields.uploadedByName = uploader.name;
      pending.fields.importBatchId = importBatchId;
      companyUpdates.set(id, pending);
      if (pending.changes.length) {
        pending.hasChanges = true;
        const changes = changedByOrganizationId.get(organizationKey) || {
          organizationId,
          company: [],
          rawCompanies: [],
        };
        changes.company.push(...pending.changes);
        changedByOrganizationId.set(organizationKey, changes);
        pending.changes = [];
      }
    }

    updateJob(job, {
      processed: index + 1,
      percent: Math.min(75, 15 + Math.floor(((index + 1) / rows.length) * 60)),
    });
  }

  const collection = mongoose.connection.db.collection("raw_Company");
  const rawUpdateOperations = [...rawUpdates.values()].map(
    ({ id, rawData, metadata }) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { rawData, _rawImport: metadata } },
      },
    }),
  );
  const companyUpdateOperations = [...companyUpdates.values()]
    .filter(({ hasChanges }) => hasChanges)
    .map(({ id, fields }) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: fields },
      },
    }));

  updateJob(job, { stage: "Updating matching companies", percent: 80 });
  for (const part of chunks(rawUpdateOperations, INSERT_CHUNK_SIZE)) {
    await collection.bulkWrite(part, { ordered: true });
  }
  for (const part of chunks(companyUpdateOperations, INSERT_CHUNK_SIZE)) {
    await Company.bulkWrite(part, { ordered: true });
  }

  updateJob(job, { stage: "Saving new raw company rows", percent: 90 });
  let insertedCount = 0;
  for (const part of chunks(newRows, INSERT_CHUNK_SIZE)) {
    if (!part.length) continue;
    const result = await collection.insertMany(part, { ordered: true });
    insertedCount += result.insertedCount;
  }

  const changedFields = [...changedByOrganizationId.values()].slice(0, 500);
  const updatedCompanyCount = companyUpdateOperations.length;
  const updatedRawCount = rawUpdateOperations.length;
  updateJob(job, {
    state: "done",
    stage: "Completed",
    percent: 100,
    processed: rows.length,
    importedCount: insertedCount,
    result: {
      collectionName: "raw_Company",
      importId,
      importBatchId,
      totalRows: rows.length,
      importedCount: insertedCount,
      updatedRawCount,
      updatedCompanyCount,
      changedFields,
      changedFieldsTotal: changedByOrganizationId.size,
      message: `Raw company import completed: ${insertedCount} new raw row(s), ${updatedRawCount} existing Raw Companies row(s) updated, and ${updatedCompanyCount} Company record(s) updated by Organization ID.`,
    },
  });
};

const runRawImport = async (job, { buffer, fileName, collectionName, uploader }) => {
  updateJob(job, { stage: "Reading worksheet", percent: 5 });

  const { rows, worksheetName } = await readWorksheet(buffer);
  if (!rows.length) throw new Error("The first worksheet contains no data rows.");

  if (job.resource === "company") {
    await runRawCompanyImport(job, {
      rows,
      worksheetName,
      fileName,
      uploader,
    });
    return;
  }

  const collection = mongoose.connection.db.collection(collectionName);
  const importedAt = new Date();
  const importId = randomUUID();
  const documents = rows.map(({ rowNumber, rawData }) => ({
    rawData,
    _rawImport: {
      importId,
      resource: job.resource,
      sourceFile: fileName,
      worksheet: worksheetName,
      rowNumber,
      uploadedBy: uploader.id,
      uploadedByName: uploader.name,
      importedAt,
    },
  }));

  updateJob(job, {
    stage: "Saving raw rows",
    totalRows: documents.length,
    processed: 0,
    importedCount: 0,
    percent: 10,
  });

  for (let offset = 0; offset < documents.length; offset += INSERT_CHUNK_SIZE) {
    const batch = documents.slice(offset, offset + INSERT_CHUNK_SIZE);
    try {
      const result = await collection.insertMany(batch, { ordered: true });
      job.importedCount += result.insertedCount;
    } catch (error) {
      job.importedCount +=
        error.insertedDocs?.length || error.result?.insertedCount || 0;
      throw new Error(
        `Could not save raw rows starting at row ${offset + 2}: ${error.message}`,
      );
    }

    const processed = offset + batch.length;
    updateJob(job, {
      processed,
      importedCount: job.importedCount,
      percent: Math.min(
        99,
        10 + Math.floor((processed / documents.length) * 89),
      ),
    });
  }

  updateJob(job, {
    state: "done",
    stage: "Completed",
    percent: 100,
    processed: documents.length,
    result: {
      collectionName,
      importId,
      totalRows: documents.length,
      importedCount: job.importedCount,
    },
  });
};

export const startRawImport = (req, res, next) => {
  try {
    const resource = req.params.resource;
    const collectionName = getCollectionName(resource);
    if (!collectionName) {
      return res.status(404).json({ message: "Raw import target not found." });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Please upload an .xlsx file." });
    }

    const uploader = getUploader(req);
    if (!uploader.id) {
      return res.status(401).json({ message: "Could not identify the uploading user." });
    }

    const job = {
      id: randomUUID(),
      userId: uploader.id,
      resource,
      state: "running",
      stage: "Queued",
      percent: 0,
      processed: 0,
      totalRows: 0,
      importedCount: 0,
      result: null,
      error: null,
      updatedAt: Date.now(),
    };
    jobs.set(job.id, job);
    setTimeout(() => jobs.delete(job.id), JOB_TTL_MS).unref?.();

    res.status(202).json({ jobId: job.id });
    runRawImport(job, {
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      collectionName,
      uploader,
    }).catch((error) => {
      console.error("Raw Excel import failed:", error);
      updateJob(job, {
        state: "failed",
        stage: "Failed",
        error: error.message || "Raw import failed.",
      });
    });
  } catch (error) {
    next(error);
  }
};

export const getRawImportStatus = (req, res) => {
  const job = jobs.get(req.params.jobId);
  const uploader = getUploader(req);

  if (!job || job.userId !== uploader.id) {
    return res.status(404).json({ message: "Raw import job not found." });
  }

  const { id, userId, ...status } = job;
  return res.json(status);
};

export const getRawImports = async (req, res, next) => {
  try {
    const collectionName = getCollectionName(req.params.resource);
    if (!collectionName) {
      return res.status(404).json({ message: "Raw import target not found." });
    }

    const imports = await mongoose.connection.db
      .collection(collectionName)
      .aggregate([
        { $match: { "_rawImport.resource": req.params.resource } },
        {
          $group: {
            _id: "$_rawImport.importId",
            fileName: { $first: "$_rawImport.sourceFile" },
            importedAt: { $first: "$_rawImport.importedAt" },
            uploadedByName: { $first: "$_rawImport.uploadedByName" },
            totalRows: { $sum: 1 },
            firstRow: { $first: "$rawData" },
          },
        },
        { $sort: { importedAt: -1 } },
        { $limit: 100 },
        {
          $project: {
            _id: 0,
            importId: "$_id",
            fileName: 1,
            importedAt: 1,
            uploadedByName: 1,
            totalRows: 1,
            columns: {
              $map: {
                input: "$firstRow",
                as: "cell",
                in: "$$cell.column",
              },
            },
          },
        },
      ])
      .toArray();

    if (req.params.resource === "prospect") {
      const [totalRows, latest] = await Promise.all([
        Prospect.countDocuments({ status: "DisQualified" }),
        Prospect.findOne({ status: "DisQualified" })
          .sort({ updatedAt: -1 })
          .select("updatedAt uploadedByName employeeName")
          .lean(),
      ]);
      if (latest) {
        imports.push({
          importId: LINKEDIN_DISQUALIFIED_IMPORT_ID,
          fileName: "LinkedIn Disqualified Prospects",
          importedAt: latest.updatedAt,
          uploadedByName: latest.uploadedByName || latest.employeeName || "",
          totalRows,
          columns: PROSPECT_RAW_FIELDS.map(({ column }) => column),
        });
        imports.sort(
          (left, right) =>
            new Date(right.importedAt || 0).getTime() -
            new Date(left.importedAt || 0).getTime(),
        );
      }
    }

    return res.json({ imports });
  } catch (error) {
    return next(error);
  }
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseRawFilters = (value) => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    for (const model of Object.values(parsed)) {
      if (model?.op !== "dateRange") continue;
      const { from = "", to = "" } = model;
      const validDate = (date) => {
        if (!date) return true;
        if (typeof date !== "string") return false;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
        const parsedDate = new Date(`${date}T00:00:00.000Z`);
        return (
          !Number.isNaN(parsedDate.getTime()) &&
          parsedDate.toISOString().slice(0, 10) === date
        );
      };
      if (!validDate(from) || !validDate(to) || (from && to && from > to)) {
        return null;
      }
    }
    return parsed;
  } catch {
    return null;
  }
};

const buildRawFilter = (filters) => {
  const clauses = [];
  for (const [field, model] of Object.entries(filters)) {
    const match = /^raw_(\d{1,4})$/.exec(field);
    if (!match || !model || typeof model !== "object") continue;
    const path = `rawData.${Number(match[1])}.value`;
    const op = model.op || "contains";
    const text = String(model.text || "").slice(0, 200);
    const regex = (pattern) => new RegExp(pattern, "i");

    if (Array.isArray(model.values)) {
      clauses.push({
        [path]: {
          $in: model.values.slice(0, 500).map((value) => {
            if (
              value == null ||
              typeof value === "number" ||
              typeof value === "boolean"
            ) {
              return value;
            }
            if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
              const date = new Date(value);
              if (!Number.isNaN(date.getTime())) return date;
            }
            return regex(`^${escapeRegex(String(value))}$`);
          }),
        },
      });
    }

    if (op === "dateRange") {
      const dateRange = {};
      const stringRange = {};
      if (model.from) {
        dateRange.$gte = new Date(`${model.from}T00:00:00.000Z`);
        stringRange.$gte = model.from;
      }
      if (model.to) {
        const end = new Date(`${model.to}T00:00:00.000Z`);
        end.setUTCDate(end.getUTCDate() + 1);
        dateRange.$lt = end;
        stringRange.$lt = end.toISOString().slice(0, 10);
      }
      const alternatives = [];
      if (Object.keys(dateRange).length) alternatives.push({ [path]: dateRange });
      if (Object.keys(stringRange).length) {
        alternatives.push({ [path]: stringRange });
      }
      if (alternatives.length === 2) clauses.push({ $or: alternatives });
      else if (alternatives.length === 1) clauses.push(alternatives[0]);
      continue;
    }

    if (["blank", "notBlank"].includes(op)) {
      clauses.push({
        [path]: op === "blank" ? { $in: [null, ""] } : { $nin: [null, ""] },
      });
      continue;
    }
    if (!text) continue;

    const escaped = escapeRegex(text);
    const pattern =
      op === "equals" || op === "notEqual"
        ? `^${escaped}$`
        : op === "startsWith"
          ? `^${escaped}`
          : op === "endsWith"
            ? `${escaped}$`
            : escaped;
    const expression = regex(pattern);
    clauses.push({
      [path]:
        op === "notContains" || op === "notEqual"
          ? { $not: expression }
          : expression,
    });
  }
  return clauses.length ? { $and: clauses } : {};
};

const rawSearchFilter = (importId, search, resource) => {
  const filter = {
    "_rawImport.importId": importId,
    "_rawImport.resource": resource,
  };
  if (search) {
    filter["rawData.value"] = { $regex: escapeRegex(search), $options: "i" };
  }
  return filter;
};

const getRawSort = (sortBy, sortOrder) => {
  const requestedSort = /^raw_(\d{1,4})$/.exec(String(sortBy || ""));
  return {
    [requestedSort
      ? `rawData.${Number(requestedSort[1])}.value`
      : "_rawImport.rowNumber"]:
      String(sortOrder).toLowerCase() === "desc" ? -1 : 1,
    "_rawImport.rowNumber": 1,
  };
};

export const getRawRows = async (req, res, next) => {
  try {
    const collectionName = getCollectionName(req.params.resource);
    if (!collectionName) {
      return res.status(404).json({ message: "Raw import target not found." });
    }

    const importId = String(req.query.importId || "").trim();
    if (!importId || importId.length > 100) {
      return res.status(400).json({ message: "A valid importId is required." });
    }

    const requestedPage = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const search = String(req.query.search || "").trim().slice(0, 200);
    const filters = parseRawFilters(req.query.filters);
    if (!filters) {
      return res.status(400).json({ message: "Invalid raw data filters." });
    }
    const filter = {
      ...rawSearchFilter(importId, search, req.params.resource),
      ...buildRawFilter(filters),
    };
    const collection = mongoose.connection.db.collection(collectionName);
    const total = await collection.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(requestedPage, totalPages);
    const projection = {
      rawData: 1,
      "_rawImport.rowNumber": 1,
    };
    if (req.params.resource === "prospect") {
      for (const { field } of PROSPECT_RAW_FIELDS) projection[field] = 1;
    }
    const [rows, sample] = await Promise.all([
      collection
        .find(filter, { projection })
        .sort(getRawSort(req.query.sortBy, req.query.sortOrder))
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      collection.findOne(
        {
          "_rawImport.importId": importId,
          "_rawImport.resource": req.params.resource,
        },
        {
          projection: { rawData: 1, "_rawImport.sourceFile": 1, "_rawImport.importedAt": 1, "_rawImport.uploadedByName": 1 },
          sort: { "_rawImport.rowNumber": 1 },
        },
      ),
    ]);

    if (!sample) {
      return res.status(404).json({ message: "Raw import not found." });
    }

    return res.json({
      import: {
        importId,
        fileName: sample._rawImport.sourceFile,
        importedAt: sample._rawImport.importedAt,
        uploadedByName: sample._rawImport.uploadedByName,
        columns: (sample.rawData || []).map((cell) => cell.column),
      },
      rows: rows.map((row) => ({
        ...Object.fromEntries(
          PROSPECT_RAW_FIELDS
            .filter(({ field }) => row[field] !== undefined)
            .map(({ field }) => [field, row[field]]),
        ),
        _id: String(row._id),
        id: String(row._id),
        rowNumber: row._rawImport.rowNumber,
        rawData: row.rawData || [],
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const exportRawExcel = async (req, res, next) => {
  let cursor;
  try {
    const collectionName = getCollectionName(req.params.resource);
    if (!collectionName) {
      return res.status(404).json({ message: "Raw import target not found." });
    }

    const importId = String(req.query.importId || "").trim();
    if (!importId || importId.length > 100) {
      return res.status(400).json({ message: "A valid importId is required." });
    }
    const filters = parseRawFilters(req.query.filters);
    if (!filters) {
      return res.status(400).json({ message: "Invalid raw data filters." });
    }

    let requestedColumns = [];
    try {
      requestedColumns = JSON.parse(req.query.columns || "[]");
    } catch {
      return res.status(400).json({ message: "Invalid export columns." });
    }
    const columns = (Array.isArray(requestedColumns) ? requestedColumns : [])
      .filter(
        (column) =>
          column &&
          /^raw_(\d{1,4})$/.test(String(column.key || "")),
      )
      .slice(0, 100)
      .map((column) => ({
        key: column.key,
        index: Number(column.key.slice(4)),
        name: String(column.name || column.key).slice(0, 200),
      }));

    const search = String(req.query.search || "").trim().slice(0, 200);
    const filter = {
      ...rawSearchFilter(importId, search, req.params.resource),
      ...buildRawFilter(filters),
    };
    const collection = mongoose.connection.db.collection(collectionName);
    const sample = await collection.findOne(
      {
        "_rawImport.importId": importId,
        "_rawImport.resource": req.params.resource,
      },
      { projection: { rawData: 1 }, sort: { "_rawImport.rowNumber": 1 } },
    );
    if (!sample) {
      return res.status(404).json({ message: "Raw import not found." });
    }
    const exportColumns =
      columns.length > 0
        ? columns
        : (sample.rawData || []).slice(0, 100).map((cell, index) => ({
            key: `raw_${index}`,
            index,
            name: String(cell.column || `Column ${index + 1}`).slice(0, 200),
          }));
    if (!exportColumns.length) {
      return res.status(400).json({ message: "This import has no exportable columns." });
    }

    cursor = collection
      .find(filter, { projection: { rawData: 1 } })
      .sort(getRawSort(req.query.sortBy, req.query.sortOrder))
      .limit(100000);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${req.params.resource}-raw-${stamp}.xlsx"`,
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Accel-Buffering", "no");

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: res,
      useStyles: true,
      useSharedStrings: false,
      zip: { zlib: { level: 1 } },
    });
    const sheet = workbook.addWorksheet("Raw data", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.columns = exportColumns.map((column) => ({
      width: Math.min(40, Math.max(14, column.name.length + 4)),
    }));
    sheet.autoFilter = {
      from: "A1",
      to: { row: 1, column: exportColumns.length },
    };

    const header = sheet.addRow(exportColumns.map((column) => column.name));
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" },
    };
    header.commit();

    let closed = false;
    res.on("close", () => {
      closed = true;
    });
    for await (const document of cursor) {
      if (closed) break;
      sheet
        .addRow(
          exportColumns.map((column) => {
            const value = document.rawData?.[column.index]?.value;
            if (value == null) return "";
            return typeof value === "object" ? JSON.stringify(value) : value;
          }),
        )
        .commit();
    }
    await sheet.commit();
    await workbook.commit();
  } catch (error) {
    if (cursor) cursor.close().catch(() => {});
    if (res.headersSent) res.destroy(error);
    else next(error);
  }
};

export const getRawDistinctValues = async (req, res, next) => {
  try {
    const collectionName = getCollectionName(req.params.resource);
    if (!collectionName) {
      return res.status(404).json({ message: "Raw import target not found." });
    }

    const importId = String(req.query.importId || "").trim();
    const field = /^raw_(\d{1,4})$/.exec(String(req.params.field || ""));
    if (!importId || importId.length > 100 || !field) {
      return res.status(400).json({ message: "A valid import and column are required." });
    }

    const filters = parseRawFilters(req.query.filters);
    if (!filters) {
      return res.status(400).json({ message: "Invalid raw data filters." });
    }
    const search = String(req.query.search || "").trim().slice(0, 200);
    const valueSearch = String(req.query.valueSearch || "").trim().slice(0, 200).toLowerCase();
    const limit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit, 10) || 200));
    const filter = {
      ...rawSearchFilter(importId, search, req.params.resource),
      ...buildRawFilter(filters),
    };
    const columnIndex = Number(field[1]);
    const collection = mongoose.connection.db.collection(collectionName);
    const pipeline = [
      { $match: filter },
      {
        $group: {
          _id: {
            $let: {
              vars: { cell: { $arrayElemAt: ["$rawData", columnIndex] } },
              in: "$$cell.value",
            },
          },
        },
      },
      ...(valueSearch
        ? [
            {
              $addFields: {
                searchValue: {
                  $convert: {
                    input: "$_id",
                    to: "string",
                    onError: "",
                    onNull: "",
                  },
                },
              },
            },
            {
              $match: {
                searchValue: {
                  $regex: escapeRegex(valueSearch),
                  $options: "i",
                },
              },
            },
          ]
        : []),
      { $sort: { _id: 1 } },
      { $limit: limit + 1 },
    ];
    const matchingValues = await collection
      .aggregate(pipeline, { allowDiskUse: true })
      .toArray();

    return res.json({
      values: matchingValues.slice(0, limit).map((item) => item._id),
      hasMore: matchingValues.length > limit,
    });
  } catch (error) {
    return next(error);
  }
};
