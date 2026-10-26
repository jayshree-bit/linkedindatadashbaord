import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff } from 'lucide-react';

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

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-2">
      {/* Left: Login form */}
      <div className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-12 lg:px-16 xl:px-24">
        <div className="w-full max-w-md">
          <div className="mb-10">
            <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white shadow-lg shadow-blue-200">
              A
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Welcome back
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-500">
              Sign in to your account to manage your workspace.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                autoComplete="username"
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

           
<div>
  <label
    htmlFor="password"
    className="mb-2 block text-sm font-semibold text-slate-700"
  >
    Password
  </label>

  <div className="relative">
    <input
      id="password"
      type={showPassword ? 'text' : 'password'}
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      placeholder="Enter your password"
      autoComplete="current-password"
      required
      className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
    />

    <button
      type="button"
      onClick={() => setShowPassword((prev) => !prev)}
      aria-label={showPassword ? 'Hide password' : 'Show password'}
      aria-pressed={showPassword}
      className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-500 transition hover:text-blue-600 focus:outline-none focus:text-blue-600"
    >
      {showPassword ? (
        <EyeOff size={20} />
      ) : (
        <Eye size={20} />
      )}
    </button>
  </div>
</div>


            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-blue-100 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-400">
            Secure access to your workspace
          </p>
        </div>
      </div>

      {/* Right: Image panel */}
      <div className="relative hidden min-h-screen overflow-hidden bg-slate-950 lg:block">
        <img
          src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1600&q=85"
          alt="Abstract digital technology and global network"
          className="absolute inset-0 h-full w-full object-cover"
        />

        <div className="absolute inset-0 bg-gradient-to-br from-blue-950/90 via-blue-900/65 to-slate-950/80" />

        <div className="relative flex min-h-screen flex-col justify-between p-12 xl:p-16">
          <div className="text-sm font-semibold tracking-[0.2em] text-blue-200">
            YOUR WORKSPACE
          </div>

          <div className="max-w-xl">
            <div className="mb-6 h-1 w-16 rounded-full bg-blue-400" />

            <h2 className="text-4xl font-bold leading-tight tracking-tight text-white xl:text-5xl">
              Everything you need.
              <span className="mt-2 block text-blue-300">
                All in one place.
              </span>
            </h2>

            <p className="mt-6 max-w-md text-base leading-7 text-blue-100/80">
              Sign in to access your dashboard, manage your data, and keep
              your team’s work moving forward.
            </p>
          </div>

          <p className="text-sm text-blue-200/70">
            Built for productivity. Designed for clarity.
          </p>
        </div>
      </div>
    </div>
  );
}