import ExcelJS from "exceljs";
import * as svc from "../services/data.service.js";

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