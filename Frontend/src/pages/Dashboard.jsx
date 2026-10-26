import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { can } from '../features/authSlice';
import { fetchDashboard } from '../features/dataSlice';

/* ---------- helpers ---------- */
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const today = () => toISO(new Date());
const monthStart = () => {
  const d = new Date();
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1));
};
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISO(d);
};

const nf = new Intl.NumberFormat('en-IN');
const compact = new Intl.NumberFormat('en-IN', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const shortDate = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
};

/* Fill days with no records so the line is continuous. */
const buildTimeline = (from, to, prospects = [], companies = []) => {
  const p = new Map(prospects.map((r) => [r.date, r.count]));
  const c = new Map(companies.map((r) => [r.date, r.count]));

  let start = from;
  let end = to;
  if (!start || !end) {
    const all = [...p.keys(), ...c.keys()].sort();
    if (!all.length) return [];
    start = start || all[0];
    end = end || all[all.length - 1];
  }

  const out = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  for (let i = 0; cur <= last && i < 366; i += 1) {
    const key = cur.toISOString().slice(0, 10);
    out.push({
      date: key,
      label: shortDate(key),
      prospects: p.get(key) || 0,
      companies: c.get(key) || 0,
    });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
};

const PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#ef4444', '#84cc16'];
const AXIS = '#94a3b8';
const GRID = 'rgba(148,163,184,0.25)';

const tooltipStyle = {
  contentStyle: {
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,0.3)',
    boxShadow: '0 10px 30px rgba(15,23,42,0.15)',
    fontSize: 12,
  },
  cursor: { fill: 'rgba(99,102,241,0.08)' },
};

const cardClass =
  'rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900';

const kpiColors = {
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
};

/* ---------- small UI pieces ---------- */
function Kpi({ title, value, sub, icon, color, loading }) {
  return (
    <article className={`${cardClass} p-5 hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-black/20`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${kpiColors[color]}`}>
          {icon}
        </span>
      </div>
      {loading ? (
        <div className="mt-5 h-8 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      ) : (
        <p className="mt-5 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</p>
      )}
      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{sub}</p>
    </article>
  );
}

function ChartCard({ title, subtitle, loading, empty, className = '', children }) {
  return (
    <section className={`${cardClass} p-5 ${className}`}>
      <h3 className="font-bold text-slate-900 dark:text-white">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
      <div className="mt-4 h-72">
        {loading && !children ? (
          <div className="h-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        ) : empty ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400 dark:border-slate-700">
            No data for this date range
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

const truncate = (s, n = 16) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : s);

function HBar({ data, dataKey = 'count', labelKey = 'label', color = '#6366f1', format = nf.format }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={{ fill: AXIS, fontSize: 11 }} tickFormatter={compact.format} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey={labelKey}
          width={110}
          tick={{ fill: AXIS, fontSize: 11 }}
          tickFormatter={(v) => truncate(v)}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip {...tooltipStyle} formatter={(v) => [format(v), 'Count']} />
        <Bar dataKey={dataKey} radius={[0, 8, 8, 0]} barSize={16}>
          {data.map((_, i) => (
            <Cell key={i} fill={color === 'multi' ? PALETTE[i % PALETTE.length] : color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ---------- page ---------- */
export default function Dashboard() {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { data, loading, error } = useSelector((state) => state.data.dashboard);

  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());

  const invalidRange = Boolean(from && to && from > to);

  // Call the API whenever a valid date range is selected.
  useEffect(() => {
    if (invalidRange) return undefined;
    const request = dispatch(fetchDashboard({ from, to, limit: 10 }));
    return () => request.abort(); // ignore stale responses when dates change quickly
  }, [dispatch, from, to, invalidRange]);

  const totals = data?.totals;
  const charts = data?.charts;

  const timeline = useMemo(
    () => buildTimeline(from, to, charts?.prospectsOverTime, charts?.companiesOverTime),
    [from, to, charts]
  );

  const employeeData = useMemo(
    () =>
      (charts?.prospectsByEmployee ?? []).map((r) => ({
        ...r,
        other: Math.max(0, r.count - r.qualified - r.disqualified),
      })),
    [charts]
  );

  const sizeData = charts?.prospectsByEmployeeSize ?? [];
  const showSkeleton = loading && !data;

  const presets = [
    { label: 'Today', from: today(), to: today() },
    { label: 'Last 7 days', from: daysAgo(6), to: today() },
    { label: 'Last 30 days', from: daysAgo(29), to: today() },
    { label: 'This month', from: monthStart(), to: today() },
  ];

  const dateInput =
    'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:focus:ring-indigo-500/30';

  return (
    <div className="space-y-8 text-slate-900 transition-colors duration-300 dark:text-slate-100">
      {/* Welcome banner */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-700 via-indigo-600 to-violet-600 p-6 text-white shadow-xl shadow-indigo-200/50 dark:shadow-none sm:p-8">
        <div className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border-[40px] border-white/10" />
        <div className="relative z-10 max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Welcome back{user?.name ? `, ${user.name}` : ''}!
          </h1>
          <p className="mt-3 text-sm leading-6 text-indigo-100 sm:text-base">
            Track prospect and company activity for any date range.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {can(user, 'prospect', 'view') && (
              <Link
                to="/prospects/viewall"
                className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-indigo-700 shadow-md transition hover:-translate-y-0.5 hover:bg-indigo-50"
              >
                View prospects →
              </Link>
            )}
            {can(user, 'company', 'view') && (
              <Link
                to="/companies"
                className="rounded-xl border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                Explore companies
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Date filter */}
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Performance overview</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {loading ? 'Updating…' : 'Select a date range to refresh the dashboard'}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => {
              const active = p.from === from && p.to === to;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setFrom(p.from);
                    setTo(p.to);
                  }}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    active
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            From
            <input type="date" className={`${dateInput} mt-1 block`} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
            To
            <input type="date" className={`${dateInput} mt-1 block`} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      </section>

      {invalidRange && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          "From" date must be on or before the "To" date.
        </p>
      )}
      {error && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      )}

      {/* KPI cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi title="Total prospects" value={nf.format(totals?.prospects ?? 0)} sub="All time" icon="♙" color="indigo" loading={showSkeleton} />
        <Kpi title="Total companies" value={nf.format(totals?.companies ?? 0)} sub="All time" icon="▤" color="emerald" loading={showSkeleton} />
        <Kpi title="Prospects in range" value={nf.format(totals?.prospectsInRange ?? 0)} sub={`${shortDate(from)} – ${shortDate(to)}`} icon="◎" color="violet" loading={showSkeleton} />
        <Kpi title="Companies in range" value={nf.format(totals?.companiesInRange ?? 0)} sub={`${shortDate(from)} – ${shortDate(to)}`} icon="◈" color="sky" loading={showSkeleton} />
        <Kpi
          title="This week"
          value={nf.format(totals?.prospectsThisWeek ?? 0)}
          sub={`${nf.format(totals?.companiesThisWeek ?? 0)} companies`}
          icon="↗"
          color="amber"
          loading={showSkeleton}
        />
        <Kpi
          title="Today"
          value={nf.format(totals?.prospectsToday ?? 0)}
          sub={`${nf.format(totals?.companiesToday ?? 0)} companies`}
          icon="★"
          color="rose"
          loading={showSkeleton}
        />
      </section>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Records added over time"
          subtitle="Daily prospects and companies"
          loading={showSkeleton}
          empty={!showSkeleton && timeline.every((d) => !d.prospects && !d.companies)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeline} margin={{ left: -10, right: 10, top: 5 }}>
              <defs>
                <linearGradient id="gProspects" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gCompanies" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipStyle} cursor={{ stroke: AXIS, strokeDasharray: 4 }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="prospects" name="Prospects" stroke="#6366f1" strokeWidth={2.5} fill="url(#gProspects)" dot={false} activeDot={{ r: 5 }} />
              <Area type="monotone" dataKey="companies" name="Companies" stroke="#10b981" strokeWidth={2.5} fill="url(#gCompanies)" dot={false} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Prospects by employee size"
          subtitle="Share of prospects in range"
          loading={showSkeleton}
          empty={!showSkeleton && !sizeData.length}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={sizeData} dataKey="count" nameKey="label" innerRadius="55%" outerRadius="80%" paddingAngle={3} cornerRadius={6}>
                {sizeData.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="none" />
                ))}
              </Pie>
              <Tooltip {...tooltipStyle} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          className="xl:col-span-2"
          title="Prospects by employee"
          subtitle="Qualified vs disqualified uploads"
          loading={showSkeleton}
          empty={!showSkeleton && !employeeData.length}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={employeeData} margin={{ left: -10, right: 10 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} tickFormatter={(v) => truncate(v, 10)} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipStyle} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="qualified" name="Qualified" stackId="s" fill="#10b981" />
              <Bar dataKey="disqualified" name="Disqualified" stackId="s" fill="#f43f5e" />
              <Bar dataKey="other" name="Other" stackId="s" fill="#94a3b8" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Prospects by country"
          subtitle="Top countries"
          loading={showSkeleton}
          empty={!showSkeleton && !(charts?.prospectsByCountry ?? []).length}
        >
          <HBar data={charts?.prospectsByCountry ?? []} color="multi" />
        </ChartCard>

        <ChartCard
          className="xl:col-span-2"
          title="Top companies by prospects"
          subtitle="Companies with the most prospects"
          loading={showSkeleton}
          empty={!showSkeleton && !(charts?.prospectsByCompany ?? []).length}
        >
          <HBar data={charts?.prospectsByCompany ?? []} color="#8b5cf6" />
        </ChartCard>

        <ChartCard
          title="Company revenue"
          subtitle="Highest numeric revenues"
          loading={showSkeleton}
          empty={!showSkeleton && !(charts?.companyRevenue ?? []).length}
        >
          <HBar data={charts?.companyRevenue ?? []} dataKey="revenue" color="#f59e0b" format={(v) => compact.format(v)} />
        </ChartCard>
      </div>
    </div>
  );
}