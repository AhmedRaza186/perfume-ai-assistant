import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { isAdmin } from '@/server/auth';
import { AdminClient } from '@/components/admin/AdminClient';

async function AuthorizedAdmin() {
  await connection();
  if (!await isAdmin()) redirect('/login');
  return <AdminClient />;
}
export default function AdminPage() {
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-xs text-stone-500">Loading store management...</div>}><AuthorizedAdmin /></Suspense>;
}

