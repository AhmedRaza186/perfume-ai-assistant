'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ChatUser { id: string; username: string; note: string; created: number; expires: number | null; active: boolean; expired: boolean; uses: number; lastUsed: number | null }

async function call(method: string, body?: unknown): Promise<ChatUser[]> {
  const response = await fetch('/api/owner/users', { method, cache: 'no-store', credentials: 'same-origin',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.details?.[0]?.message || data.error || 'Request failed.');
  return data.users;
}
const date = (value: number | null) => value ? new Date(value).toLocaleString() : '—';
const input = 'mt-1 w-full rounded-md border border-stone-200 p-2';

export function OwnerClient() {
  const router = useRouter();
  const [users, setUsers] = useState<ChatUser[]>();
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', note: '', days: '' });
  useEffect(() => { call('GET').then(setUsers).catch(failure => setError(failure.message)); }, []);
  async function run(method: string, body: unknown) {
    if (busy) return false;
    setBusy(true); setError('');
    try { setUsers(await call(method, body)); return true; }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Request failed.'); return false; }
    finally { setBusy(false); }
  }
  const field = (key: keyof typeof form) => ({ value: form[key], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }) });
  return <div className="min-h-screen bg-[#F9F8F6]"><main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
    <div className="flex items-center justify-between gap-4">
      <h1 className="text-base font-semibold text-stone-900">Owner Portal · Chat users</h1>
      <button className="text-xs text-stone-600" onClick={async () => {
        try { const response = await fetch('/api/owner/logout', { method: 'POST' }); if (!response.ok) throw new Error(); router.push('/owner/login'); router.refresh(); }
        catch { setError('Could not sign out. Please retry.'); }
      }}>Sign out</button>
    </div>
    <p className="text-xs text-stone-600">Only these usernames can chat with the AI assistant. Disabling, deleting or changing a password signs that user out immediately.</p>
    <form className="rounded-xl border border-stone-200 bg-white p-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_100px_auto] items-end" onSubmit={async event => {
      event.preventDefault();
      const { days, ...rest } = form;
      if (await run('POST', { ...rest, ...(days ? { days: Number(days) } : {}) })) setForm({ username: '', password: '', note: '', days: '' });
    }}>
      <label className="text-xs">Username<input required minLength={3} maxLength={64} pattern="[a-zA-Z0-9._\-]+" autoComplete="off" className={input} {...field('username')} /></label>
      <label className="text-xs">Password<input required minLength={6} maxLength={256} autoComplete="new-password" className={input} {...field('password')} /></label>
      <label className="text-xs">Note<input maxLength={200} placeholder="e.g. Client demo" className={input} {...field('note')} /></label>
      <label className="text-xs">Valid days<input type="number" min={1} max={3650} placeholder="No limit" className={input} {...field('days')} /></label>
      <button disabled={busy} className="rounded-lg bg-stone-900 px-4 py-2 text-xs text-white disabled:opacity-50">Create</button>
    </form>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    {!users ? <p className="text-xs text-stone-500">Loading...</p> : users.length === 0 ? <p className="text-xs text-stone-500">No chat users yet. Until you create one, only you (signed in here) can use the assistant.</p> :
      <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white"><table className="w-full text-xs">
        <thead className="text-left text-stone-500"><tr>{['Username', 'Note', 'Status', 'Sign-ins', 'Last sign-in', 'Expires', ''].map(h => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead>
        <tbody>{users.map(user => <tr key={user.id} className="border-t border-stone-100">
          <td className="p-3 font-medium text-stone-900">{user.username}</td><td className="p-3">{user.note || '—'}</td>
          <td className="p-3">{user.expired ? 'Expired' : user.active ? 'Active' : 'Disabled'}</td>
          <td className="p-3">{user.uses}</td><td className="p-3">{date(user.lastUsed)}</td><td className="p-3">{user.expires ? date(user.expires) : 'Never'}</td>
          <td className="p-3 whitespace-nowrap text-right space-x-3">
            <button disabled={busy} className="text-stone-700 underline" onClick={() => void run('PATCH', { id: user.id, active: !user.active })}>{user.active ? 'Disable' : 'Enable'}</button>
            <button disabled={busy} className="text-stone-700 underline" onClick={() => { const password = prompt(`New password for ${user.username} (6+ characters):`); if (password) void run('PATCH', { id: user.id, password }); }}>Change password</button>
            <button disabled={busy} className="text-red-700 underline" onClick={() => { if (confirm(`Delete "${user.username}"?`)) void run('DELETE', { id: user.id }); }}>Delete</button>
          </td>
        </tr>)}</tbody>
      </table></div>}
  </main></div>;
}
