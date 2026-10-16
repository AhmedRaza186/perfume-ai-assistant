'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AdminHeader, type AdminTab } from './AdminHeader';
import { ProductManager } from './ProductManager';
import { PolicyManager } from './PolicyManager';
import { EnquiryManager } from './EnquiryManager';
import { WorkflowManager } from './WorkflowManager';
import { AudioPlayerProvider } from '@/context/AudioPlayerContext';
import { getStore, saveStore, resetDemoData, type StoreSnapshot } from '@/utils/storage';

export function AdminClient() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AdminTab>('products');
  const [store, setStore] = useState<StoreSnapshot>();
  const [policyKey, setPolicyKey] = useState(0);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { getStore().then(setStore).catch(error => setError(error.message)); }, []);
  async function save(section: 'products' | 'policies' | 'enquiries', data: unknown): Promise<boolean> {
    if (!store || busy) return false;
    setBusy(true); setError('');
    try { setStore(await saveStore(section, data, store.revision)); return true; }
    catch (error) { setError(error instanceof Error ? error.message : 'Changes could not be saved.'); return false; }
    finally { setBusy(false); }
  }
  async function reset() {
    if (busy) return;
    if (!confirm('Reset demo products and policies and delete saved conversations, audio and enquiries?')) return;
    setBusy(true); setError('');
    try { setStore(await resetDemoData()); setPolicyKey(previous => previous + 1); }
    catch (error) { setError(error instanceof Error ? error.message : 'Reset failed.'); }
    finally { setBusy(false); }
  }
  if (!store) return <div className="min-h-screen flex items-center justify-center bg-[#F9F8F6] text-xs text-stone-500">{error || 'Loading store management...'}</div>;
  return <AudioPlayerProvider><div className="min-h-screen bg-[#F9F8F6] flex flex-col">
    <AdminHeader activeTab={activeTab} onTabChange={setActiveTab} onResetData={reset} />
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
      <div className="flex justify-end mb-3"><button className="text-xs text-stone-600" onClick={async () => {
        try {
          const response = await fetch('/api/auth/logout', { method: 'POST' });
          if (!response.ok) throw new Error();
          router.push('/login'); router.refresh();
        } catch { setError('Could not sign out. Please retry.'); }
      }}>Sign out</button></div>
      {error && <p role="alert" className="mb-4 text-xs text-red-700">{error} <button disabled={busy} onClick={() => getStore().then(value => { setStore(value); setPolicyKey(previous => previous + 1); setError(''); }).catch(error => setError(error.message))}>Reload data</button></p>}
      <fieldset disabled={busy} className="min-w-0">
        {activeTab === 'products' && <ProductManager products={store.products} onUpdateProducts={data => save('products', data)} />}
        {activeTab === 'policies' && <PolicyManager key={policyKey} policies={store.policies} onUpdatePolicies={data => save('policies', data)} />}
        {activeTab === 'enquiries' && <EnquiryManager enquiries={store.enquiries} onUpdateEnquiries={data => save('enquiries', data.map(({ id, status, notes }) => ({ id, status, notes })))} />}
        {(activeTab === 'orders' || activeTab === 'conversations' || activeTab === 'knowledge') && <WorkflowManager key={activeTab} mode={activeTab} />}
      </fieldset>
    </main>
  </div></AudioPlayerProvider>;
}
