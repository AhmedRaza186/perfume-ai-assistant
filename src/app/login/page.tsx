'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  return <main className="min-h-screen flex items-center justify-center bg-[#F9F8F6] p-4">
    <form className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 space-y-4" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError('');
      const form = new FormData(event.currentTarget);
      try {
        const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(form)) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        router.push('/admin'); router.refresh();
      } catch (error) { setError(error instanceof Error ? error.message : 'Sign-in failed.'); }
      finally { setBusy(false); }
    }}>
      <h1 className="text-base font-semibold">Store Administration</h1>
      <label className="block text-xs">Username<input name="username" autoComplete="username" required maxLength={100} className="mt-1 w-full rounded-md border border-stone-200 p-2" /></label>
      <label className="block text-xs">Password<input name="password" type="password" autoComplete="current-password" required maxLength={256} className="mt-1 w-full rounded-md border border-stone-200 p-2" /></label>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <button disabled={busy} className="rounded-lg bg-stone-900 px-4 py-2 text-xs text-white disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </main>;
}
