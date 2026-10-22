
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { can } from '../features/authSlice';

const stats = [
  {
    title: 'Total prospects',
    value: '2,840',
    change: '+12.8%',
    note: 'vs. last month',
    icon: '♙',
    color: 'indigo',
  },
  {
    title: 'Companies',
    value: '486',
    change: '+8.2%',
    note: 'vs. last month',
    icon: '▤',
    color: 'emerald',
  },
  {
    title: 'New this week',
    value: '124',
    change: '+18.4%',
    note: 'vs. last week',
    icon: '↗',
    color: 'amber',
  },
  {
    title: 'Conversion rate',
    value: '6.24%',
    change: '+2.1%',
    note: 'vs. last month',
    icon: '◎',
    color: 'violet',
  },
];

const colors = {
  indigo:
    'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300',
  emerald:
    'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  amber:
    'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  violet:
    'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
};

const cardClass =
  'rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900';

const headingClass = 'font-bold text-slate-900 dark:text-white';
const descriptionClass = 'text-sm text-slate-500 dark:text-slate-400';

export default function Dashboard() {
  const { user } = useSelector((state) => state.auth);

  const initials = (user?.name || user?.email || 'U')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-8 text-slate-900 transition-colors duration-300 dark:text-slate-100">
      {/* Welcome banner */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-700 via-indigo-600 to-violet-600 p-6 text-white shadow-xl shadow-indigo-200/50 dark:shadow-none sm:p-9">
        <div className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border-[40px] border-white/10" />
        <div className="pointer-events-none absolute -bottom-24 right-48 h-48 w-48 rounded-full bg-white/5" />

        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-indigo-50">
            <span className="h-2 w-2 rounded-full bg-emerald-300" />
            SALES WORKSPACE
          </span>

          <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
            Welcome back{user?.name ? `, ${user.name}` : ''}!
          </h1>

          <p className="mt-3 max-w-lg text-sm leading-6 text-indigo-100 sm:text-base">
            Manage your prospects, explore company data, and keep your sales
            workflow moving forward.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {can(user, 'prospect', 'view') && (
              <Link
                to="/prospects"
                className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-indigo-700 shadow-md transition hover:-translate-y-0.5 hover:bg-indigo-50"
              >
                View prospects →
              </Link>
            )}

            {can(user, 'company', 'view') && (
              <Link
                to="/companies"
                className="rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                Explore companies
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Performance overview */}
      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Performance overview
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              A snapshot of your workspace
            </p>
          </div>

          <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            Sample metrics
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <article
              key={stat.title}
              className={`${cardClass} p-5 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-200/60 dark:hover:shadow-black/20`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {stat.title}
                </p>
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl ${colors[stat.color]}`}
                >
                  {stat.icon}
                </span>
              </div>

              <p className="mt-5 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                {stat.value}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-md bg-emerald-50 px-2 py-1 font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  {stat.change}
                </span>
                <span className="text-slate-400 dark:text-slate-500">
                  {stat.note}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Quick access and account */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className={`${cardClass} p-6 xl:col-span-2`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className={headingClass}>Quick access</h2>
              <p className={`mt-1 ${descriptionClass}`}>
                Jump straight into your workspace
              </p>
            </div>
            <span className="text-xl text-indigo-500 dark:text-indigo-400">
              ↗
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {can(user, 'prospect', 'view') && (
              <Link
                to="/prospects"
                className="group rounded-xl border border-slate-200 p-4 transition hover:border-indigo-200 hover:bg-indigo-50/50 dark:border-slate-700 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-500/10"
              >
                <span className="text-xl text-indigo-600 dark:text-indigo-400">
                  ♙
                </span>
                <h3 className="mt-3 font-semibold text-slate-800 dark:text-slate-100">
                  Manage prospects
                </h3>
                <p className={`mt-1 ${descriptionClass}`}>
                  View and manage your prospect records.
                </p>
                <p className="mt-3 text-sm font-semibold text-indigo-600 transition group-hover:translate-x-1 dark:text-indigo-400">
                  Open prospects →
                </p>
              </Link>
            )}

            {can(user, 'company', 'view') && (
              <Link
                to="/companies"
                className="group rounded-xl border border-slate-200 p-4 transition hover:border-emerald-200 hover:bg-emerald-50/50 dark:border-slate-700 dark:hover:border-emerald-500/50 dark:hover:bg-emerald-500/10"
              >
                <span className="text-xl text-emerald-600 dark:text-emerald-400">
                  ▤
                </span>
                <h3 className="mt-3 font-semibold text-slate-800 dark:text-slate-100">
                  Explore companies
                </h3>
                <p className={`mt-1 ${descriptionClass}`}>
                  Access company information and records.
                </p>
                <p className="mt-3 text-sm font-semibold text-emerald-600 transition group-hover:translate-x-1 dark:text-emerald-400">
                  Open companies →
                </p>
              </Link>
            )}

            {can(user, 'user', 'view') && (
              <Link
                to="/users"
                className="group rounded-xl border border-slate-200 p-4 transition hover:border-violet-200 hover:bg-violet-50/50 dark:border-slate-700 dark:hover:border-violet-500/50 dark:hover:bg-violet-500/10"
              >
                <span className="text-xl text-violet-600 dark:text-violet-400">
                  ♧
                </span>
                <h3 className="mt-3 font-semibold text-slate-800 dark:text-slate-100">
                  User management
                </h3>
                <p className={`mt-1 ${descriptionClass}`}>
                  Manage users and access permissions.
                </p>
                <p className="mt-3 text-sm font-semibold text-violet-600 transition group-hover:translate-x-1 dark:text-violet-400">
                  Manage users →
                </p>
              </Link>
            )}
          </div>
        </div>

        {/* Workspace account */}
        <div className={`${cardClass} p-6`}>
          <h2 className={headingClass}>Your workspace</h2>
          <p className={`mt-1 ${descriptionClass}`}>
            Your current account details
          </p>

          <div className="mt-6 flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 font-bold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-800 dark:text-slate-100">
                {user?.name || user?.username || 'User'}
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {user?.email}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4 border-t border-slate-100 pt-5 dark:border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                Role
              </span>
              <span className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                {user?.role?.name || 'Member'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                Session
              </span>
              <span className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Signed in
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
