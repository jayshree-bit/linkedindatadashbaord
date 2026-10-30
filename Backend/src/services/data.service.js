import mongoose from 'mongoose';
import Prospect from '../models/Prospect.js';
import Company from '../models/Company.js';
import User from '../models/User.js';
import { companyLists } from '../controllers/data.controller.js';
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
const TZ = '+05:30';
const IST_MS = 330 * 60 * 1000;
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
     "Campaign":      { op: "contains", text: "",     values: ["Lead Gen Agent"] },
     "userId":        { op: "equals",   text: "<user ObjectId>" }   // special key, see below
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

/* Special filter key `userId` (prospects only): "uploaded by this user".
   Same rule the dashboard stats use (prospects.uploadedBy = user _id).
   It must be a real ObjectId here because $match inside aggregate() (the distinct
   values list) does not cast strings the way find() does.
   An invalid id matches nothing, so a bad link never shows everyone's rows. */
const userScopeCondition = (model) => {
  const id = typeof model === 'string' ? model : model?.text;

  if (!id || !mongoose.isValidObjectId(id)) {
    return { _id: { $exists: false } };
  }
  return { uploadedBy: new mongoose.Types.ObjectId(id) };
};

/* Special filter key `companyListId` (prospects only): match uploaded domains / names. */
const COMPANY_LIST_FIELDS = {
  prospect: { domainFields: ['companyDomain'], nameField: 'companyName' },
  company: { domainFields: ['domain', 'website'], nameField: 'name' },
};

const companyListCondition = (resource, model) => {
  const id = typeof model === 'string' ? model : model?.text;
  const list = companyLists.get(id);
  const cfg = COMPANY_LIST_FIELDS[resource];

  // Unknown or expired list matches nothing, never everything.
  if (!list || !cfg) return { _id: { $exists: false } };

  const or = [];

  if (list.domains.length) {
    const alt = list.domains.map(escapeRegex).join('|');
    // Stored values may carry http://, www., a trailing slash or a path (website).
    const domainRegex = new RegExp(`^(https?://)?(www\\.)?(${alt})(/.*)?$`, 'i');
    for (const f of cfg.domainFields) or.push({ [f]: domainRegex });
  }

  if (list.names.length) {
    const alt = list.names.map(escapeRegex).join('|');
    or.push({ [cfg.nameField]: new RegExp(`^(${alt})$`, 'i') });
  }

  return or.length ? { $or: or } : { _id: { $exists: false } };
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
    // Locked "employee" filter coming from the dashboard link
    if (resource === 'prospect' && gridKey === 'userId') {
      conditions.push(userScopeCondition(model));
      continue;
    }

    // Company list uploaded from Excel (domains / company names)
   if ((resource === 'prospect' || resource === 'company') && gridKey === 'companyListId') {
      conditions.push(companyListCondition(resource, model));
      continue;
    }

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
  { search = '', sortBy = '', sortOrder = 'asc', filters = '' } = {},
  dbFields = []
) => {
  const Model = getModel(resource);
  const filter = buildFilter(resource, { search, filters });

  const sortField = resolveField(resource, sortBy);
  const sort = isSafeKey(sortField)
    ? { [sortField]: sortOrder === 'desc' ? -1 : 1, _id: -1 }
    : { createdAt: -1, _id: -1 };

  // Fetch only the columns being exported
  const safeFields = [...new Set(dbFields.filter(isSafeKey))];
  const projection = safeFields.length
    ? Object.fromEntries(safeFields.map((f) => [f, 1]))
    : undefined;

  // No collation: it blocks index use for the sort and slows large exports.
  return Model.find(filter, projection)
    .sort(sort)
    .allowDiskUse(true)
    .batchSize(2000)
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



/* India has no DST, so a fixed +05:30 offset is safe. */




/* Monday 00:00 (IST) of the current week, as a UTC Date. */
const startOfWeek = () => {
  const ist = new Date(Date.now() + IST_MS);
  const sinceMonday = (ist.getUTCDay() + 6) % 7;
  ist.setUTCHours(0, 0, 0, 0);
  ist.setUTCDate(ist.getUTCDate() - sinceMonday);
  return new Date(ist.getTime() - IST_MS);
};

const startOfToday = () => {
  const ist = new Date(Date.now() + IST_MS);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_MS);
};
const idFromDate = (date) =>
  mongoose.Types.ObjectId.createFromTime(Math.floor(date.getTime() / 1000));

const dateMatch = (range) => {
  if (!Object.keys(range).length) return {};

  const idRange = {};
  if (range.$gte) idRange.$gte = idFromDate(range.$gte);
  if (range.$lte) idRange.$lt = idFromDate(new Date(range.$lte.getTime() + 1000));

  return {
    $or: [
      { createdAt: range },
      { createdAt: { $exists: false }, _id: idRange },
    ],
  };
};
const createdOrId = { $ifNull: ['$createdAt', { $toDate: '$_id' }] };
const exactRevenueText = {
  $toLower: {
    $trim: {
      input: {
        $toString: {
          $ifNull: [
            { $getField: { field: 'Exact Revenue', input: '$$ROOT' } },
            { $ifNull: ['$exactRevenue', ''] },
          ],
        },
      },
    },
  },
};
/* from / to are "YYYY-MM-DD"; both ends are inclusive. */
const parseRange = ({ from, to }) => {
  const range = {};

  if (from) {
    const d = new Date(`${from}T00:00:00.000${TZ}`);
    if (Number.isNaN(d.getTime())) throw badRequest('Invalid "from" date, use YYYY-MM-DD');
    range.$gte = d;
  }
  if (to) {
    const d = new Date(`${to}T23:59:59.999${TZ}`);
    if (Number.isNaN(d.getTime())) throw badRequest('Invalid "to" date, use YYYY-MM-DD');
    range.$lte = d;
  }
  if (range.$gte && range.$lte && range.$gte > range.$lte) {
    throw badRequest('"from" must be before "to"');
  }

  return range;
};

/* Group by a text field, ignoring case and blanks, newest label wins. */
const groupByText = (field, limit) => [
  { $match: { [field]: { $nin: [null, ''] } } },
  {
    $group: {
      _id: { $toLower: { $trim: { input: `$${field}` } } },
      label: { $first: `$${field}` },
      count: { $sum: 1 },
    },
  },
  { $sort: { count: -1, _id: 1 } },
  { $limit: limit },
  { $project: { _id: 0, label: 1, count: 1 } },
];
/* Group by employeeName (case-insensitive), with qualified / disqualified split. */
const groupByEmployeeName = (limit) => [
  { $match: { employeeName: { $nin: [null, ''] } } },
  {
    $group: {
      _id: { $toLower: { $trim: { input: '$employeeName' } } },
      label: { $first: '$employeeName' },
      count: { $sum: 1 },
      qualified: { $sum: { $cond: [{ $eq: ['$status', 'Qualified'] }, 1, 0] } },
      disqualified: { $sum: { $cond: [{ $eq: ['$status', 'DisQualified'] }, 1, 0] } },
    },
  },
  { $sort: { count: -1, _id: 1 } },
  { $limit: limit },
  { $project: { _id: 0, label: 1, count: 1, qualified: 1, disqualified: 1 } },
];
const dailyCounts = [
  {
    $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: createdOrId, timezone: TZ } },
      count: { $sum: 1 },
    },
  },
  { $sort: { _id: 1 } },
  { $project: { _id: 0, date: '$_id', count: 1 } },
];

/* exactRevenue is stored as a string, so turn "1,200,000" / "$1200000" into a number.
   Values such as "10M-50M" or "1.2B" cannot be converted and are skipped here. */
const revenueNumber = {
  $let: {
    vars: {
      m: {
        $regexFind: {
          input: exactRevenueText,
          regex: '^\\$?\\s*([0-9][0-9,]*\\.?[0-9]*)\\s*(billion|bn|b|million|mn|m|thousand|k)?\\+?$',
        },
      },
    },
    in: {
      $cond: [
        { $eq: ['$$m', null] },
        null,
        {
          $multiply: [
            {
              $convert: {
                input: {
                  $replaceAll: {
                    input: { $arrayElemAt: ['$$m.captures', 0] },
                    find: ',',
                    replacement: '',
                  },
                },
                to: 'double',
                onError: null,
                onNull: null,
              },
            },
            {
              $let: {
                vars: {
                  unit: { $ifNull: [{ $arrayElemAt: ['$$m.captures', 1] }, ''] },
                },
                in: {
                  $switch: {
                    branches: [
                      { case: { $in: ['$$unit', ['billion', 'bn', 'b']] }, then: 1e9 },
                      { case: { $in: ['$$unit', ['million', 'mn', 'm']] }, then: 1e6 },
                      { case: { $in: ['$$unit', ['thousand', 'k']] }, then: 1e3 },
                    ],
                    default: 1,
                  },
                },
              },
            },
          ],
        },
      ],
    },
  },
};

const companyLabel = {
  $ifNull: [
    { $getField: { field: 'Company Name', input: '$$ROOT' } },
    { $ifNull: ['$companyName', { $ifNull: ['$name', '$domain'] }] },
  ],
};

export const getDashboard = async ({ from, to, limit = 10 } = {}) => {
  const top = Math.min(50, Math.max(1, Number.parseInt(limit, 10) || 10));
  const range = parseRange({ from, to });
const rangeMatch = dateMatch(range);
const weekStart = startOfWeek();
const dayStart = startOfToday();

  const [
    totalProspects,
    totalCompanies,
    prospectsThisWeek,
    companiesThisWeek,
    prospectsToday,
    companiesToday,
    [p],
    [c],
  ] = await Promise.all([
    Prospect.estimatedDocumentCount(),
    Company.estimatedDocumentCount(),
  Prospect.countDocuments(dateMatch({ $gte: weekStart })),
Company.countDocuments(dateMatch({ $gte: weekStart })),
Prospect.countDocuments(dateMatch({ $gte: dayStart })),
Company.countDocuments(dateMatch({ $gte: dayStart })),

    Prospect.aggregate([
      { $match: rangeMatch },
      {
        $facet: {
          count: [{ $count: 'n' }],
          byCountry: groupByText('country', top),
          byCompany: groupByText('companyName', top),
          byEmployeeSize: groupByText('employeeSize', top),
          byJobLevel: groupByText('jobLevel', top),          // NEW
          byEmployeeName: groupByEmployeeName(top),          // NEW
          byEmployee: [
            {
              $group: {
                _id: '$uploadedBy',
                count: { $sum: 1 },
                qualified: { $sum: { $cond: [{ $eq: ['$status', 'Qualified'] }, 1, 0] } },
                disqualified: { $sum: { $cond: [{ $eq: ['$status', 'DisQualified'] }, 1, 0] } },
                employeeName: { $first: '$employeeName' },
              },
            },
            { $sort: { count: -1 } },
            { $limit: top },
          ],
          overTime: dailyCounts,
        },
      },
    ]),

    Company.aggregate([
      { $match: rangeMatch },
      {
        $facet: {
          count: [{ $count: 'n' }],
          overTime: dailyCounts,
          revenue: [
            { $addFields: { revenueValue: revenueNumber } },
            { $match: { revenueValue: { $gt: 0 } } },
            { $sort: { revenueValue: -1 } },
            { $limit: top },
            {
              $project: {
    _id: 0,
    label: companyLabel,
    revenue: '$revenueValue',
    revenueRange: { $ifNull: [{ $getField: { field: 'Revenue', input: '$$ROOT' } }, '$revenue'] },
  },
            },
          ],
        },
      },
    ]),
  ]);

  /* Names for the "prospects by employee" chart. */
  const ids = p.byEmployee.map((r) => r._id).filter(Boolean);
  const users = ids.length
    ? await User.find({ _id: { $in: ids } }).select('name email').lean()
    : [];
  const userById = new Map(users.map((u) => [String(u._id), u]));

  const byEmployee = p.byEmployee.map((r) => {
    const u = r._id ? userById.get(String(r._id)) : null;
    return {
      userId: r._id || null,
      label: u?.name || u?.email || r.employeeName || 'Unassigned',
      count: r.count,
      qualified: r.qualified,
      disqualified: r.disqualified,
    };
  });

  return {
    range: { from: from || null, to: to || null },
    totals: {
      prospects: totalProspects,
      companies: totalCompanies,
      prospectsInRange: p.count[0]?.n || 0,
      companiesInRange: c.count[0]?.n || 0,
      prospectsThisWeek,
      companiesThisWeek,
      prospectsToday,
      companiesToday,
      weekStartsOn: weekStart.toISOString(),
    },
    charts: {
      prospectsByCountry: p.byCountry,
      prospectsByCompany: p.byCompany,
      prospectsByEmployee: byEmployee,
      prospectsByEmployeeName: p.byEmployeeName,
      prospectsByJobLevel: p.byJobLevel, 
      prospectsByEmployeeSize: p.byEmployeeSize,
      prospectsOverTime: p.overTime,
      companiesOverTime: c.overTime,
      companyRevenue: c.revenue,
    },
  };
};