import type { Product } from '@/types/product';
import type { StorePolicies } from '@/types/policy';
import type { Enquiry } from '@/types/enquiry';

export interface StoreSnapshot { products: Product[]; policies: StorePolicies; enquiries: Enquiry[]; revision: number }
async function request(url: string, init?: RequestInit): Promise<StoreSnapshot> {
  const response = await fetch(url, { ...init, cache: 'no-store', credentials: 'same-origin' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Store data could not be saved.');
  return data;
}
export const getStore = () => request('/api/admin/store');
export function saveStore(section: 'products' | 'policies' | 'enquiries', data: unknown, revision: number) {
  return request('/api/admin/store', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section, data, revision }) });
}
export const resetDemoData = () => request('/api/admin/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation: 'RESET DEMO DATA' }) });

