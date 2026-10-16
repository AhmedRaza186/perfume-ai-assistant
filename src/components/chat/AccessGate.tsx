'use client';
import { useState } from 'react';
import { Lock } from 'lucide-react';
import { unlockAccess } from '@/services/assistantService';

export function AccessGate({ onGranted }: { onGranted: (username: string | null) => void }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const field = 'flex-1 min-w-0 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm';
  return <form className="border-t border-stone-200/80 bg-white/80 px-4 sm:px-7 py-4 flex flex-col gap-2" onSubmit={async event => {
    event.preventDefault(); if (busy || !username || !password) return;
    setBusy(true); setError('');
    try { const access = await unlockAccess(username, password); setPassword(''); onGranted(access.username); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Sign-in failed.'); }
    finally { setBusy(false); }
  }}>
    <p className="flex items-center gap-1.5 text-xs text-stone-600"><Lock className="w-3.5 h-3.5" />Sign in with your assigned username and password to chat with the assistant</p>
    <div className="flex flex-col sm:flex-row gap-2">
      <input aria-label="Username" autoComplete="username" required maxLength={64} value={username} onChange={e => setUsername(e.target.value)} className={field} placeholder="Username" />
      <input aria-label="Password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e => setPassword(e.target.value)} className={field} placeholder="Password" />
      <button disabled={busy || !username || !password} className="rounded-full bg-stone-900 px-4 py-2 text-xs text-white disabled:opacity-50">{busy ? 'Checking…' : 'Start chat'}</button>
    </div>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </form>;
}
