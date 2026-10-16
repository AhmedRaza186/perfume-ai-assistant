import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { isOwner } from '@/server/auth';
import { OwnerClient } from '@/components/owner/OwnerClient';

async function AuthorizedOwner() {
  await connection();
  if (!await isOwner()) redirect('/owner/login');
  return <OwnerClient />;
}
export default function OwnerPage() {
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-xs text-stone-500">Loading owner portal...</div>}><AuthorizedOwner /></Suspense>;
}
