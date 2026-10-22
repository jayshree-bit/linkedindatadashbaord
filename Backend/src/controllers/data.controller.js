import ExcelJS from "exceljs";
import * as svc from "../services/data.service.js";
import Prospect from '../models/Prospect.js';


const PROSPECT_COLUMN_MAP = {
  'employee code': 'employeeCode',
  'employee name': 'employeeName',
  date: 'date',
  campaign: 'campaign',

  'first name': 'firstName',
  'last name': 'lastName',
  'company name': 'companyName',
  'email address': 'emailAddress',
  'specific title': 'specificTitle',
  'job level': 'jobLevel',
  'job role': 'jobRole',
  'phone number': 'phoneNumber',

  'address 1': 'address1',
  'address 2': 'address2',
  'city': 'city',
  'state': 'state',
  'zipcode': 'zipcode',
  'country': 'country',

  'main industry': 'mainIndustry',
  'industry': 'industry',
  'sub industry': 'industry',
  'see all employee size': 'seeAllEmployeeSize',
  'employee size': 'employeeSize',
  'exact revenue': 'exactRevenue',
  'revenue': 'revenue',

  'company domain': 'companyDomain',
  'website': 'website',
  'company linkedin url': 'companyLinkedinUrl',
  'linkedin profile link': 'linkedinProfileLink',
  'linkedin profile link sn': 'linkedinProfileLinkSN',
  'revenue link': 'revenueLink',

  'sic code': 'sicCode',
  'naics code': 'naicsCode',
  'prospect tenure': 'prospectTenure',
  'ra comments': 'raComment',
  'ra comment': 'raComment',
  'address link': 'addressLink',
  'call notes': 'callNotes',
  'dispositions': 'dispositions',

  'note1': 'note1',
  'note2': 'note2',
  'note3': 'note3',

  'status': 'status',
  'primary reason': 'primaryReason',
  'qa comment': 'qaComment',
  'ebb status': 'ebbStatus',
  'auditor name': 'auditorName',
  'audit date': 'auditDate',
};


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

/* ---------- Excel export (streams .xlsx, respects search + sort + column filters) ---------- */
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

    cursor = svc.exportCursor(resource, req.query);

    // No columns sent: fall back to the keys of the first record.
    let first = null;
    if (columns.length === 0) {
      first = await cursor.next();
      columns = Object.keys(first || {})
        .filter((k) => !["_id", "__v"].includes(k))
        .map((k) => ({ key: k, name: k }));
    }

    const dbFields = columns.map((c) => svc.fieldFor(resource, c.key));
    const stamp = new Date().toISOString().slice(0, 10);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${resource}-${stamp}.xlsx"`,
    );

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: res,
      useStyles: true,
    });
    const sheet = workbook.addWorksheet(resource, {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    sheet.columns = columns.map((c) => ({
      key: c.key,
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
      const values = {};
      columns.forEach((c, i) => {
        values[c.key] = toCell(doc[dbFields[i]]);
      });
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


const normalizeHeader = (value) =>
  String(value ?? '').trim().toLowerCase();

function getExcelValue(cell) {
  const value = cell.value;

  if (value == null) return '';

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'object') {
    if (value.hyperlink) return value.hyperlink;
    if (value.richText) {
      return value.richText.map((part) => part.text).join('');
    }
    if (value.text != null) return value.text;
    if (value.result != null) return value.result;
    return '';
  }

  return value;
}
const ALLOWED_STATUSES = ['Qualified', 'DisQualified'];

const normalizeEmail = (value) =>
  String(value || '').trim().toLowerCase();

const normalizeLinkedIn = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '');

export async function importProspectsExcel(req, res, next) {
  try {
    const selectedStatus = String(req.body.status || '').trim();

    if (!ALLOWED_STATUSES.includes(selectedStatus)) {
      return res.status(400).json({
        message: 'Select Qualified or DisQualified before uploading.',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: 'Please upload an Excel file.',
      });
    }

    // Keep your existing ExcelJS parsing and column-mapping code here.
    // It should produce an array named "prospects".
    //
    // Example:
    // const prospects = [
    //   { firstName: 'Jane', emailAddress: 'jane@example.com', ... }
    // ];

    // Always use the status selected in the upload form.
    const rows = prospects.map((prospect) => ({
      ...prospect,
      status: selectedStatus,
      emailAddress: normalizeEmail(prospect.emailAddress),
      linkedinProfileLink: normalizeLinkedIn(
        prospect.linkedinProfileLink
      ),
    }));

    // DisQualified: import directly without checking duplicates.
    if (selectedStatus === 'DisQualified') {
      const result = await Prospect.insertMany(rows, {
        ordered: false,
      });

      return res.status(200).json({
        message: 'DisQualified Excel import completed.',
        selectedStatus,
        importedCount: result.length,
        duplicateCheckPerformed: false,
      });
    }

    // Qualified: check existing database records for duplicates.
    const emails = [
      ...new Set(
        rows.map((p) => p.emailAddress).filter(Boolean)
      ),
    ];

    const linkedinUrls = [
      ...new Set(
        rows
          .map((p) => p.linkedinProfileLink)
          .filter(Boolean)
      ),
    ];

    const duplicateConditions = [];

    if (emails.length) {
      duplicateConditions.push({
        emailAddress: { $in: emails },
      });
    }

    if (linkedinUrls.length) {
      duplicateConditions.push({
        linkedinProfileLink: { $in: linkedinUrls },
      });
    }

    const existingRecords = duplicateConditions.length
      ? await Prospect.find(
          { $or: duplicateConditions },
          { emailAddress: 1, linkedinProfileLink: 1 }
        ).lean()
      : [];

    const existingEmails = new Set(
      existingRecords
        .map((p) => normalizeEmail(p.emailAddress))
        .filter(Boolean)
    );

    const existingLinkedIn = new Set(
      existingRecords
        .map((p) => normalizeLinkedIn(p.linkedinProfileLink))
        .filter(Boolean)
    );

    // Also catch duplicate rows within the same Excel file.
    const seenEmails = new Set();
    const seenLinkedIn = new Set();

    const uniqueRows = [];
    const duplicates = [];

    for (const row of rows) {
      const email = normalizeEmail(row.emailAddress);
      const linkedin = normalizeLinkedIn(row.linkedinProfileLink);

      const duplicateInDatabase =
        (email && existingEmails.has(email)) ||
        (linkedin && existingLinkedIn.has(linkedin));

      const duplicateInFile =
        (email && seenEmails.has(email)) ||
        (linkedin && seenLinkedIn.has(linkedin));

      if (duplicateInDatabase || duplicateInFile) {
        duplicates.push({
          firstName: row.firstName || '',
          lastName: row.lastName || '',
          emailAddress: email,
          linkedinProfileLink: linkedin,
          reason: duplicateInDatabase
            ? 'Already exists in database'
            : 'Duplicate row in uploaded Excel',
        });

        continue;
      }

      uniqueRows.push(row);

      if (email) seenEmails.add(email);
      if (linkedin) seenLinkedIn.add(linkedin);
    }

    const imported = uniqueRows.length
      ? await Prospect.insertMany(uniqueRows, { ordered: false })
      : [];

    return res.status(200).json({
      message: 'Qualified Excel import completed.',
      selectedStatus,
      totalRows: rows.length,
      importedCount: imported.length,
      duplicateCount: duplicates.length,
      duplicateCheckPerformed: true,
      duplicates,
    });
  } catch (error) {
    next(error);
  }
}