import Prospect from '../models/Prospect.js';
import Company from '../models/Company.js';

const models = {
  prospect: Prospect,
  company: Company,
};

// Optional: map a grid column key to the real MongoDB field name.
// Leave empty if the grid keys already equal your DB field names.
// Example: prospect: { 'Employee Code': 'employeeCode', 'Email Address': 'emailAddress' }
const FIELD_MAP = {
  prospect: {},
  company: {},
};

const badRequest = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

export const getModel = (name) => {
  const model = models[name];

  if (!model) {
    const error = new Error(`Unknown resource: ${name}`);
    error.status = 404;
    throw error;
  }

  return model;
};

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const resolveField = (resource, key) => FIELD_MAP[resource]?.[key] ?? key;

// Block operator injection ($...) and nested paths (a.b).
const isSafeKey = (key) =>
  typeof key === 'string' &&
  key.length > 0 &&
  key.length <= 100 &&
  !key.startsWith('$') &&
  !key.includes('.') &&
  !key.includes('\0');

/* ---------- Column filters ----------
   filters = {
     "Employee Name": { op: "contains", text: "sach", values: null },
     "Campaign":      { op: "contains", text: "",     values: ["Lead Gen Agent"] }
   }
*/
const textCondition = (op, rawText) => {
  const text = escapeRegex(String(rawText ?? '').slice(0, 200));

  switch (op) {
    case 'contains':
      return text ? new RegExp(text, 'i') : null;
    case 'notContains':
      return text ? { $not: new RegExp(text, 'i') } : null;
    case 'equals':
      return text ? new RegExp(`^${text}$`, 'i') : null;
    case 'notEqual':
      return text ? { $not: new RegExp(`^${text}$`, 'i') } : null;
    case 'startsWith':
      return text ? new RegExp(`^${text}`, 'i') : null;
    case 'endsWith':
      return text ? new RegExp(`${text}$`, 'i') : null;
    case 'blank':
      return { $in: [null, ''] };
    case 'notBlank':
      return { $nin: [null, ''] };
    default:
      return null;
  }
};

const parseFilters = (resource, raw) => {
  if (!raw) return [];

  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (typeof parsed !== 'object' || parsed === null) return [];

  const conditions = [];

  for (const [gridKey, model] of Object.entries(parsed)) {
    const field = resolveField(resource, gridKey);
    if (!isSafeKey(field)) continue;

    // Backwards compatible with a plain string: { "City": "pune" }
    const m = typeof model === 'string' ? { op: 'contains', text: model } : model;
    if (!m || typeof m !== 'object') continue;

    const textCond = textCondition(m.op ?? 'contains', m.text);
    if (textCond) conditions.push({ [field]: textCond });

    if (Array.isArray(m.values)) {
      const values = m.values.slice(0, 500);
      // A "(Blanks)" selection (null or '') must match both missing and empty values.
      const wantsBlank = values.some((v) => v === null || v === '');
      const list = wantsBlank ? [...values, null, ''] : values;
      conditions.push({ [field]: { $in: list } });
    }
  }

  return conditions;
};

const buildFilter = (resource, { search = '', filters = '' } = {}) => {
  const filter = {};

  const conditions = parseFilters(resource, filters);
  if (conditions.length) filter.$and = conditions;

  const searchText = String(search).trim();
  if (searchText) {
    const regex = new RegExp(escapeRegex(searchText), 'i');

    if (resource === 'prospect') {
      filter.$or = [
        { employeeCode: regex },
        { employeeName: regex },
        { firstName: regex },
        { lastName: regex },
        { companyName: regex },
        { emailAddress: regex },
        { phoneNumber: regex },
        { campaign: regex },
        { specificTitle: regex },
        { companyDomain: regex },
        { city: regex },
        { state: regex },
        { country: regex },
        { status: regex },
        { primaryReason: regex },
      ];
    } else if (resource === 'company') {
      filter.$or = [
        { name: regex },
        { companyName: regex },
        { domain: regex },
        { website: regex },
      ];
    }
  }

  return filter;
};

/* ---------- List ---------- */
export const list = async (
  resource,
  {
    page = 1,
    limit = 10,
    search = '',
    sortBy = '',
    sortOrder = 'asc',
    filters = '',
  } = {}
) => {
  const Model = getModel(resource);

  const currentPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(limit, 10) || 10)
  );

  const filter = buildFilter(resource, { search, filters });

  const sortField = resolveField(resource, sortBy);
  const sort = isSafeKey(sortField)
    ? { [sortField]: sortOrder === 'desc' ? -1 : 1, _id: -1 }
    : { createdAt: -1, _id: -1 };

  const [records, total] = await Promise.all([
    Model.find(filter)
      .sort(sort)
      .collation({ locale: 'en', strength: 2 })
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Model.countDocuments(filter),
  ]);

  return {
    data: records,
    pagination: {
      page: currentPage,
      limit: pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasNextPage: currentPage * pageSize < total,
      hasPrevPage: currentPage > 1,
    },
  };
};

/* ---------- Distinct values for the column filter checklist ----------
   Returns { values: [...], hasMore }. Blank / missing values are returned as a single null.
   `filters` should already exclude the column being edited (the frontend does this).
*/
export const distinct = async (
  resource,
  gridKey,
  { search = '', filters = '', valueSearch = '', limit = 200 } = {}
) => {
  const Model = getModel(resource);

  const field = resolveField(resource, gridKey);
  if (!isSafeKey(field)) throw badRequest('Invalid field');

  const max = Math.min(500, Math.max(1, Number.parseInt(limit, 10) || 200));
  const filter = buildFilter(resource, { search, filters });
  const own = String(valueSearch).trim().slice(0, 100);

  const raw = { $getField: { field, input: '$$ROOT' } };
  const pipeline = [];

  if (Object.keys(filter).length) pipeline.push({ $match: filter });

  pipeline.push({
    $group: {
      _id: {
        $cond: [{ $in: [{ $ifNull: [raw, null] }, [null, '']] }, null, raw],
      },
    },
  });

  if (own) pipeline.push({ $match: { _id: new RegExp(escapeRegex(own), 'i') } });

  pipeline.push({ $sort: { _id: 1 } }, { $limit: max + 1 });

  const rows = await Model.aggregate(pipeline);

  return {
    values: rows.slice(0, max).map((row) => row._id),
    hasMore: rows.length > max,
  };
};

/* ---------- Export ----------
   Same search / sort / column filters as the grid, but no pagination.
   Returns a Mongo cursor so large exports are streamed instead of loaded into memory.
*/
export const fieldFor = (resource, gridKey) => resolveField(resource, gridKey);

export const exportCursor = (
  resource,
  { search = '', sortBy = '', sortOrder = 'asc', filters = '' } = {}
) => {
  const Model = getModel(resource);
  const filter = buildFilter(resource, { search, filters });

  const sortField = resolveField(resource, sortBy);
  const sort = isSafeKey(sortField)
    ? { [sortField]: sortOrder === 'desc' ? -1 : 1, _id: -1 }
    : { createdAt: -1, _id: -1 };

  return Model.find(filter)
    .sort(sort)
    .collation({ locale: 'en', strength: 2 })
    .lean()
    .cursor();
};

export const create = (resource, data) =>
  getModel(resource).create(data);

export const update = (resource, id, data) =>
  getModel(resource).findByIdAndUpdate(
    id,
    { $set: data },
    { new: true, runValidators: true }
  );

export const remove = (resource, id) =>
  getModel(resource).findByIdAndDelete(id);