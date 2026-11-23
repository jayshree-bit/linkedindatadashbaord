import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Mail, Lock, ShieldCheck, Loader2 } from 'lucide-react';

/*
  Palette (from your index.css overrides):
  indigo-*  -> teal   (brand, #0f9f92 at 600)
  violet-*  -> sky
  purple-*  -> amber  (accent)
*/

const PREVIEW_ROWS = [
  { name: 'Aarav Mehta', company: 'Northwind Labs', status: 'Verified', tone: 'teal' },
  { name: 'Priya Nair', company: 'Brightline Co.', status: 'In review', tone: 'amber' },
  { name: 'Daniel Brooks', company: 'Helix Systems', status: 'Verified', tone: 'teal' },
  { name: 'Sara Kim', company: 'Orbit Retail', status: 'New', tone: 'sky' },
];

const TONES = {
  teal: 'bg-indigo-400/15 text-indigo-200 ring-indigo-300/30',
  amber: 'bg-purple-400/15 text-purple-200 ring-purple-300/30',
  sky: 'bg-violet-400/15 text-violet-200 ring-violet-300/30',
};

function initials(name) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2);
}

export default function Login() {
  const navigate = useNavigate();
  const { login, loading, error } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await login(email, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      console.error('Login failed:', err);
    }
  };

  const inputBase =
    'w-full rounded-xl border border-slate-200 bg-slate-50/60 py-3.5 pl-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100';

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Left: form */}
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12 sm:px-12 lg:px-16 xl:px-24">
        {/* soft brand glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-100/70 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -right-24 h-80 w-80 rounded-full bg-purple-100/60 blur-3xl"
        />

        <div className="relative w-full max-w-md">
          <div className="mb-10">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-xl font-bold text-white shadow-lg shadow-indigo-200">
                A
              </div>
              <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-[#17243b]">
              Welcome back
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#68778f]">
              Sign in to manage your prospects, companies and team access.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-semibold text-[#17243b]"
              >
                Email address
              </label>
              <div className="relative">
                <Mail
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  autoComplete="username"
                  required
                  className={`${inputBase} pr-4`}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-semibold text-[#17243b]"
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  className={`${inputBase} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 flex items-center rounded-r-xl px-4 text-slate-400 transition hover:text-indigo-600 focus:outline-none focus-visible:text-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-300"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#c62828]"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:from-indigo-700 hover:to-indigo-600 hover:shadow-indigo-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <p className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400">
            <ShieldCheck size={14} className="text-indigo-500" />
            Role-based access keeps your data protected
          </p>
        </div>
      </div>

      {/* Right: product preview panel */}
      <div className="relative hidden min-h-screen overflow-hidden bg-gradient-to-br from-indigo-950 via-violet-950 to-[#04201f] lg:block">
        {/* dot grid */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(rgba(153,246,228,0.35) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
            maskImage:
              'radial-gradient(ellipse at 60% 40%, black 30%, transparent 75%)',
            WebkitMaskImage:
              'radial-gradient(ellipse at 60% 40%, black 30%, transparent 75%)',
          }}
        />
        {/* glows */}
        <div
          aria-hidden="true"
          className="absolute -right-24 top-10 h-96 w-96 rounded-full bg-indigo-500/25 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-violet-500/20 blur-3xl"
        />

        <div className="relative flex min-h-screen flex-col justify-between p-12 xl:p-16">
          <div className="flex items-center gap-2 text-sm font-medium text-indigo-100/80">
            <span className="h-2 w-2 rounded-full bg-purple-400" />
            Your workspace
          </div>

          {/* Data-grid preview */}
          <div className="relative mx-auto my-10 w-full max-w-lg">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-2 shadow-2xl shadow-black/30 backdrop-blur-md">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                </div>
                <span className="text-xs font-medium text-indigo-100/70">
                  Prospects
                </span>
              </div>

              <div className="divide-y divide-white/5 rounded-xl bg-[#04201f]/60">
                {PREVIEW_ROWS.map((row) => (
                  <div
                    key={row.name}
                    className="flex items-center gap-3 px-4 py-3.5"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 text-xs font-bold text-indigo-950">
                      {initials(row.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">
                        {row.name}
                      </p>
                      <p className="truncate text-xs text-indigo-100/60">
                        {row.company}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${TONES[row.tone]}`}
                    >
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* floating accent card */}
            <div className="absolute -bottom-8 -left-6 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-xl shadow-black/30">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
                <ShieldCheck size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#17243b]">
                  Permissions applied
                </p>
                <p className="text-xs text-[#68778f]">
                  You only see what your role allows
                </p>
              </div>
            </div>
          </div>

          <div className="max-w-md">
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-white xl:text-4xl">
              Every prospect, company and teammate in one place.
            </h2>
            <p className="mt-4 text-sm leading-6 text-indigo-100/70">
              Sign in to review your data, manage users and keep your team
              working from the same view.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}