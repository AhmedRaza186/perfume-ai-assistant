'use client';
import { useState } from 'react';
import Image from 'next/image';
import type { Product } from '@/types/product';
import { formatPrice } from '@/utils/textUtils';
import { INITIAL_PRODUCTS } from '@/fixtures/products';
const blank: Product = { id: '', name: '', size: '', price: 0, description: '', category: 'fresh', image: '/images/products/velvet-oud.svg', inStock: null, dataSource: 'business' };
export function ProductManager({ products, onUpdateProducts }: { products: Product[]; onUpdateProducts: (products: Product[]) => Promise<boolean> }) {
  const [editing, setEditing] = useState<Product>(); const [isNew, setIsNew] = useState(false);
  const input = 'w-full bg-white border border-stone-200 rounded-md p-2 text-xs min-w-0';
  return <section className="space-y-4">
    <div className="flex justify-between items-center"><div><h2 className="font-semibold text-sm">Catalogue management</h2><p className="text-xs text-stone-500">Record facts used by recommendations and comparisons. Unknown fields stay unknown.</p></div>
      <button className="bg-stone-900 text-white text-xs rounded-lg px-3 py-2" onClick={() => { setEditing({ ...blank, id: `prod-${crypto.randomUUID()}` }); setIsNew(true); }}>Add product</button></div>
    {editing && <form className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3 text-xs" onSubmit={async e => {
      e.preventDefault(); const data = isNew ? [...products, editing] : products.map(p => p.id === editing.id ? editing : p);
      if (await onUpdateProducts(data)) setEditing(undefined);
    }}>
      <h3 className="font-semibold">{isNew ? 'Add product' : 'Edit product'}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(['name', 'size', 'description', 'notes', 'useGuidance'] as const).map(key => <label key={key} className={key === 'description' || key === 'useGuidance' ? 'sm:col-span-2' : ''}>
          {({ name: 'Product name', size: 'Size label', description: 'Recorded description', notes: 'Recorded notes (optional)', useGuidance: 'Recorded occasion/use guidance (optional)' })[key]}
          <input className={input} required={['name', 'size', 'description'].includes(key)} maxLength={key === 'name' || key === 'size' ? 120 : key === 'useGuidance' ? 1000 : 2000} value={editing[key] || ''} onChange={e => setEditing({ ...editing, [key]: e.target.value })} />
        </label>)}
        <label>Price (PKR)<input className={input} type="number" step="0.01" min="0" max="1000000" required value={editing.price} onChange={e => setEditing({ ...editing, price: Number(e.target.value) })} /></label>
        <label>Bottle volume (ml, optional)<input className={input} type="number" min="1" max="5000" value={editing.bottleSizeMl ?? ''} onChange={e => setEditing({ ...editing, bottleSizeMl: e.target.value ? Number(e.target.value) : undefined })} /></label>
        <label>Category<select className={input} value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value as Product['category'] })}>{['fresh', 'oriental', 'floral', 'woody'].map(category => <option key={category}>{category}</option>)}</select></label>
        <label>Recorded availability<select className={input} value={editing.inStock === null ? 'unknown' : editing.inStock ? 'yes' : 'no'} onChange={e => setEditing({ ...editing, inStock: e.target.value === 'unknown' ? null : e.target.value === 'yes' })}><option value="unknown">Unknown</option><option value="yes">In stock</option><option value="no">Out of stock</option></select></label>
        <fieldset className="space-y-2"><legend>Recorded fragrance families</legend><div className="flex flex-wrap gap-3">{(['fresh', 'floral', 'woody', 'sweet', 'oud'] as const).map(family => <label key={family} className="flex gap-1 capitalize"><input type="checkbox" checked={editing.families?.includes(family) || false} onChange={e => setEditing({ ...editing, families: e.target.checked ? [...(editing.families || []), family] : editing.families?.filter(f => f !== family) })} />{family}</label>)}</div></fieldset>
        <fieldset className="space-y-2"><legend>Recorded occasions</legend><div className="flex flex-wrap gap-3">{(['office', 'daily', 'gift', 'evening'] as const).map(occasion => <label key={occasion} className="flex gap-1 capitalize"><input type="checkbox" checked={editing.occasions?.includes(occasion) || false} onChange={e => setEditing({ ...editing, occasions: e.target.checked ? [...(editing.occasions || []), occasion] : editing.occasions?.filter(f => f !== occasion) })} />{occasion}</label>)}</div></fieldset>
        <label>Source<select className={input} value={editing.dataSource || 'business'} onChange={e => setEditing({ ...editing, dataSource: e.target.value as Product['dataSource'] })}><option value="business">Business record</option><option value="demo">Fictional demo</option></select></label>
      </div>
      <p className="text-stone-500">Do not record longevity, projection or ingredients unless the business can substantiate them. Unticked families/occasions are unknown, not assumed unsuitable.</p>
      {INITIAL_PRODUCTS.some(p => p.id === editing.id) && <button type="button" className="underline" onClick={() => {
        const demo = INITIAL_PRODUCTS.find(p => p.id === editing.id)!;
        setEditing({ ...editing, bottleSizeMl: demo.bottleSizeMl, families: demo.families, occasions: demo.occasions, useGuidance: demo.useGuidance, dataSource: 'demo' });
      }}>Fill clearly fictional demo preference metadata (review before saving)</button>}
      <div className="flex gap-3"><button className="bg-stone-900 text-white px-3 py-2 rounded-md">Save product</button><button type="button" onClick={() => setEditing(undefined)}>Cancel</button></div>
    </form>}
    <div className="border border-stone-200 rounded-xl bg-white divide-y divide-stone-100">{products.map(product => <div key={product.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0"><Image src={product.image} alt={product.name} width={48} height={48} className="rounded-lg" /><div className="min-w-0"><h3 className="font-medium text-sm break-words">{product.name}</h3><p className="text-xs text-stone-500">{product.size} · {product.inStock === null ? 'Availability unknown' : product.inStock ? 'In stock' : 'Out of stock'}</p><p className="text-[11px] text-stone-500">{product.dataSource === 'demo' ? 'Fictional demo data' : 'Stored catalogue facts; verify business accuracy'}</p></div></div>
      <div className="flex gap-3 text-xs items-center"><strong>{formatPrice(product.price)}</strong><button className="underline" onClick={() => { setEditing({ ...product }); setIsNew(false); }}>Edit</button><button className="text-red-700 underline" onClick={() => { if (confirm('Delete this product? Existing order requests retain their submitted product snapshot.')) void onUpdateProducts(products.filter(p => p.id !== product.id)); }}>Delete</button></div>
    </div>)}</div>
  </section>;
}
