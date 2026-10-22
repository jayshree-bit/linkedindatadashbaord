
import { NavLink } from 'react-router-dom';
import { can } from '../../features/authSlice';

const navigation = [
  {
    label: 'OVERVIEW',
    items: [
      { name: 'Dashboard', path: '/dashboard', icon: '▦', resource: null },
    ],
  },
  {
    label: 'WORKSPACE',
    items: [
      { name: 'Prospects', path: '/prospects', icon: '♙', resource: 'prospect' },
      { name: 'Companies', path: '/companies', icon: '▤', resource: 'company' },
      { name: 'User management', path: '/users', icon: '♧', resource: 'user' },
    ],
  },
];

export default function Sidebar({
  user,
  isOpen,
  onClose,
  mini,
  onToggleMini,
}) {
  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/30 dark:bg-black/60 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col
          border-r border-slate-200 bg-white text-slate-700
          transition-all duration-300
          dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200
          ${mini ? 'w-20' : 'w-60'}
          lg:translate-x-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Brand */}
        <div
          className={`relative flex h-20 shrink-0 items-center border-b
            border-slate-200 dark:border-slate-800
            ${mini ? 'justify-center px-2' : 'justify-between px-5'}`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white shadow-sm">
              P
            </div>

            {!mini && (
              <div className="min-w-0">
                <h1 className="whitespace-nowrap text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                  Prospect
                  <span className="text-indigo-600 dark:text-indigo-400">
                    Flow
                  </span>
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Sales intelligence
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onToggleMini}
            title={mini ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={mini ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`hidden h-8 w-8 shrink-0 items-center justify-center
              rounded-lg text-slate-500 hover:bg-slate-100 hover:text-indigo-600
              dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-indigo-400
              lg:flex ${
                mini
                  ? 'absolute -right-3 top-7 z-10 border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900'
                  : ''
              }`}
          >
            {mini ? '»' : '«'}
          </button>
        </div>

        {/* Navigation */}
        <div className={`flex-1 overflow-y-auto py-6 ${mini ? 'px-2' : 'px-3'}`}>
          {navigation.map((group) => {
            const visibleItems = group.items.filter(
              (item) => !item.resource || can(user, item.resource, 'view')
            );

            if (!visibleItems.length) return null;

            return (
              <div key={group.label} className="mb-7">
                {!mini && (
                  <p className="mb-3 px-3 text-[10px] font-bold tracking-[0.16em] text-slate-400 dark:text-slate-500">
                    {group.label}
                  </p>
                )}

                <nav className="space-y-1">
                  {visibleItems.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={onClose}
                      title={mini ? item.name : undefined}
                      className={({ isActive }) =>
                        `flex items-center rounded-lg border py-2.5 text-sm font-medium transition-colors
                        ${mini ? 'justify-center px-2' : 'gap-3 px-3'}
                        ${
                          isActive
                            ? 'border-indigo-100 bg-indigo-50 text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-500/15 dark:text-indigo-300'
                            : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-white'
                        }`
                      }
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-lg">
                        {item.icon}
                      </span>

                      {!mini && <span className="truncate">{item.name}</span>}
                    </NavLink>
                  ))}
                </nav>
              </div>
            );
          })}
        </div>

        {/* Workspace status */}
        {!mini ? (
          <div className="shrink-0 border-t border-slate-200 p-4 dark:border-slate-800">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Workspace active
                </span>
              </div>

              <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                Manage your sales pipeline and company data in one place.
              </p>
            </div>

            <p className="pt-4 text-center text-[11px] text-slate-400 dark:text-slate-500">
              ProspectFlow · Workspace
            </p>
          </div>
        ) : (
          <div className="flex shrink-0 justify-center border-t border-slate-200 py-5 dark:border-slate-800">
            <span
              title="Workspace active"
              className="h-2.5 w-2.5 rounded-full bg-emerald-500"
            />
          </div>
        )}
      </aside>
    </>
  );
}
