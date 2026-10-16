'use client';

import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { StorePolicies } from '@/types/policy';

interface PolicyManagerProps {
  policies: StorePolicies;
  onUpdatePolicies: (updated: StorePolicies) => Promise<boolean>;
}

export const PolicyManager: React.FC<PolicyManagerProps> = ({
  policies,
  onUpdatePolicies,
}) => {
  const [formData, setFormData] = useState<StorePolicies>(policies);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!await onUpdatePolicies(formData)) return;
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-stone-900">Store Policies Configuration</h2>
          <p className="text-xs text-stone-500">
            The assistant uses these policy rules when answering customer queries about delivery, COD and returns.
          </p>
        </div>

        <button
          type="submit"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 px-3.5 py-1.5 rounded-lg transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Save Changes</span>
        </button>
      </div>

      {saveSuccess && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-fade-in">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>Policy changes saved successfully!</span>
        </div>
      )}

      {/* SECTION 1: Delivery Policy */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 shadow-2xs space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
          Delivery Policy
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-stone-700 font-medium mb-1">Standard Duration</label>
            <input
              type="text"
              value={formData.delivery.standardDuration}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  delivery: { ...formData.delivery, standardDuration: e.target.value },
                })
              }
              className="w-full bg-stone-50/50 border border-stone-200 rounded-md p-2 text-stone-900 focus:outline-hidden focus:border-stone-400"
            />
          </div>

          <div>
            <label className="block text-stone-700 font-medium mb-1">Delivery Charges</label>
            <input
              type="text"
              value={formData.delivery.charges}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  delivery: { ...formData.delivery, charges: e.target.value },
                })
              }
              className="w-full bg-stone-50/50 border border-stone-200 rounded-md p-2 text-stone-900 focus:outline-hidden focus:border-stone-400"
            />
          </div>

          <div>
            <label className="block text-stone-700 font-medium mb-1">
              Free Delivery Threshold (PKR)
            </label>
            <input
              type="number"
              value={formData.delivery.freeDeliveryThreshold}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  delivery: {
                    ...formData.delivery,
                    freeDeliveryThreshold: Number(e.target.value),
                  },
                })
              }
              className="w-full bg-stone-50/50 border border-stone-200 rounded-md p-2 text-stone-900 focus:outline-hidden focus:border-stone-400"
            />
          </div>

          <div>
            <label className="block text-stone-700 font-medium mb-1">Courier & Coverage</label>
            <input
              type="text"
              value={formData.delivery.cities}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  delivery: { ...formData.delivery, cities: e.target.value },
                })
              }
              className="w-full bg-stone-50/50 border border-stone-200 rounded-md p-2 text-stone-900 focus:outline-hidden focus:border-stone-400"
            />
          </div>
        </div>
      </div>

      {/* SECTION 2: Payment Policy */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 shadow-2xs space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
          Payment & Cash on Delivery (COD)
        </h3>

        <div className="space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="codActive"
              checked={formData.payment.codAvailable}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  payment: { ...formData.payment, codAvailable: e.target.checked },
                })
              }
              className="w-3.5 h-3.5 accent-stone-900 rounded"
            />
            <label htmlFor="codActive" className="text-stone-700 font-medium">
              Enable Cash on Delivery (COD) nationwide
            </label>
          </div>

          <div>
            <label className="block text-stone-700 font-medium mb-1">Advance Payment Rule</label>
            <input
              type="text"
              value={formData.payment.advanceRequired}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  payment: { ...formData.payment, advanceRequired: e.target.value },
                })
              }
              className="w-full bg-stone-50/50 border border-stone-200 rounded-md p-2 text-stone-900 focus:outline-hidden focus:border-stone-400"
            />
          </div>

          <div>
            <label className="block text-stone-700 font-medium mb-1">Bank Transfer Details</label>
            <input
              type="text"
              value={formData.payment.bankDetails || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  payment: { ...formData.payment, bankDetails: e.target.value },
                })
              }
              className="w-full bg-stone-50/50 border border-stone-200 rounded-md p-2 text-stone-900 focus:outline-hidden focus:border-stone-400"
            />
          </div>
        </div>
      </div>

      {/* SECTION 3: Returns & Exchange Policy */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 sm:p-5 shadow-2xs space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
          Returns & Exchange Policy
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-stone-700 font-medium mb-1">Return Window (Days)</label>
            <input
              type="number"
              value={formData.returns.windowDays}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  returns: { ...formData.returns, windowDays: Number(e.target.value) },
                })
              }
              className="w-full bg-stone-50/50 border border-stone-200 rounded-md p-2 text-stone-900 focus:outline-hidden focus:border-stone-400"
            />
          </div>

          <div>
            <label className="block text-stone-700 font-medium mb-1">Exchange Conditions</label>
            <input
              type="text"
              value={formData.returns.exchangePolicy}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  returns: { ...formData.returns, exchangePolicy: e.target.value },
                })
              }
              className="w-full bg-stone-50/50 border border-stone-200 rounded-md p-2 text-stone-900 focus:outline-hidden focus:border-stone-400"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-stone-700 font-medium mb-1">Return Conditions & Criteria</label>
            <textarea
              rows={2}
              value={formData.returns.conditions}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  returns: { ...formData.returns, conditions: e.target.value },
                })
              }
              className="w-full bg-stone-50/50 border border-stone-200 rounded-md p-2 text-stone-900 focus:outline-hidden focus:border-stone-400"
            />
          </div>
        </div>
      </div>
      <section className="bg-white border border-stone-200 rounded-xl p-4 space-y-3 text-xs">
        <h3 className="font-semibold">Delivery calculation rules</h3>
        <p className="text-stone-500">Only these explicit rules calculate charges for order requests. City names must match; use * for a store-approved universal rule. City-specific rules take priority. With no matching rule, charges and eligibility remain pending. The prose policy alone is not interpreted as a calculation rule.</p>
        {(formData.delivery.rules || []).map((rule, index) => <div key={index} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <label>Cities (comma separated)<input className="w-full border border-stone-200 rounded p-2" value={rule.cities.join(', ')} onChange={e => setFormData({ ...formData, delivery: { ...formData.delivery, rules: formData.delivery.rules?.map((r, i) => i === index ? { ...r, cities: e.target.value.split(',').map(v => v.trim()) } : r) } })} /></label>
          <label>Charge (PKR)<input className="w-full border border-stone-200 rounded p-2" type="number" min="0" value={rule.charge} onChange={e => setFormData({ ...formData, delivery: { ...formData.delivery, rules: formData.delivery.rules?.map((r, i) => i === index ? { ...r, charge: Number(e.target.value) } : r) } })} /></label>
          <label>Free above (optional)<input className="w-full border border-stone-200 rounded p-2" type="number" min="0" value={rule.freeAbove ?? ''} onChange={e => setFormData({ ...formData, delivery: { ...formData.delivery, rules: formData.delivery.rules?.map((r, i) => i === index ? { ...r, freeAbove: e.target.value ? Number(e.target.value) : undefined } : r) } })} /></label>
          <button type="button" className="self-end p-2 text-red-700" onClick={() => setFormData({ ...formData, delivery: { ...formData.delivery, rules: formData.delivery.rules?.filter((_, i) => i !== index) } })}>Remove rule</button>
        </div>)}
        <button type="button" className="underline" onClick={() => setFormData({ ...formData, delivery: { ...formData.delivery, rules: [...(formData.delivery.rules || []), { cities: [], charge: 0 }] } })}>Add delivery rule</button>
      </section>
    </form>
  );
};
