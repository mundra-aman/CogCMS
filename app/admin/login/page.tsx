'use client';

import { CmsBrand } from '@/components/admin/cms-brand';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { loginAction } from './actions';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append('email', email);
      formData.append('password', password);
      formData.append('rememberMe', rememberMe ? 'true' : 'false');

      const result = await loginAction(formData);
      if ('error' in result) {
        if ('code' in result && result.code === 'RATE_LIMITED') {
          const minutes = Math.max(1, Math.ceil(result.retryAfter / 60));
          setError(`${result.error} Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
        } else {
          setError(result.error);
        }
      } else if (result.success) {
        router.push('/admin/dashboard');
      }
    });
  };

  return (
    <main className="cms-workspace flex min-h-[100dvh] items-center justify-center bg-stone-50 px-5 py-12 text-stone-950">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <CmsBrand />
        </div>
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to your workspace</h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            Manage your websites, prepare content and publish with your team.
          </p>
          <form onSubmit={handleLogin} className="mt-7 space-y-5" aria-busy={isPending}>
            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {error}
              </p>
            ) : null}
            <div>
              <label htmlFor="cms-email" className="block text-sm font-medium">
                Email
              </label>
              <input
                id="cms-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm placeholder:text-stone-500"
              />
            </div>
            <div>
              <label htmlFor="cms-password" className="block text-sm font-medium">
                Password
              </label>
              <input
                id="cms-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="mt-2 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                name="rememberMe"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                className="h-4 w-4 accent-orange-700"
              />
              Keep me signed in on this device
            </label>
            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-lg bg-orange-700 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-800 disabled:cursor-wait disabled:opacity-70"
            >
              {isPending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </section>
        <p className="mt-6 text-center text-sm leading-6 text-stone-600">
          Need access or a password reset? Contact your CMS administrator.
        </p>
      </div>
    </main>
  );
}
