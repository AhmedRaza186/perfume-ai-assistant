'use client';

import React, { useState } from 'react';
import { MessageSquare, Mic, UserCheck, CheckCircle2, Clock } from 'lucide-react';
import { Enquiry, EnquiryStatus } from '@/types/enquiry';

interface EnquiryManagerProps {
  enquiries: Enquiry[];
  onUpdateEnquiries: (updated: Enquiry[]) => Promise<boolean>;
}

export const EnquiryManager: React.FC<EnquiryManagerProps> = ({
  enquiries,
  onUpdateEnquiries,
}) => {
  const [filter, setFilter] = useState<string>('all');

  const filteredEnquiries = enquiries.filter((e) => {
    if (filter === 'all') return true;
    return e.status === filter;
  });

  const handleStatusChange = (id: string, newStatus: EnquiryStatus) => {
    const updated = enquiries.map((e) => {
      if (e.id === id) {
        return { ...e, status: newStatus };
      }
      return e;
    });
    onUpdateEnquiries(updated);
  };

  const getStatusBadge = (status: EnquiryStatus) => {
    switch (status) {
      case 'Open':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3" />
            <span>Open</span>
          </span>
        );
      case 'Needs Human Follow-up':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            <UserCheck className="w-3 h-3" />
            <span>Needs Human</span>
          </span>
        );
      case 'Resolved':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            <span>Resolved</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Filter Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-stone-900">Customer Enquiries & Logs</h2>
          <p className="text-xs text-stone-500">
            Saved human-help requests for admin review. No notification is sent automatically.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg self-start sm:self-auto">
          {['all', 'Open', 'Needs Human Follow-up', 'Resolved'].map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                filter === key
                  ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {key === 'all' ? 'All' : key}
            </button>
          ))}
        </div>
      </div>

      {/* Enquiries List */}
      <div className="border border-stone-200 rounded-xl overflow-hidden bg-white shadow-2xs divide-y divide-stone-100">
        {filteredEnquiries.length === 0 ? (
          <div className="p-8 text-center text-xs text-stone-500">
            No customer enquiries match this filter.
          </div>
        ) : (
          filteredEnquiries.map((enquiry) => (
            <div key={enquiry.id} className="p-4 space-y-2 hover:bg-stone-50/50 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-stone-900">
                    {enquiry.customerName}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                    {enquiry.channel === 'Voice Note' ? (
                      <Mic className="w-3 h-3 text-stone-600" />
                    ) : (
                      <MessageSquare className="w-3 h-3 text-stone-600" />
                    )}
                    <span>{enquiry.channel}</span>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-stone-400">{enquiry.timestamp}</span>
                  {getStatusBadge(enquiry.status)}
                </div>
              </div>

              {/* Snippet */}
              <p className="text-xs text-stone-700 leading-relaxed bg-stone-50 p-2 rounded-md border border-stone-200/60">
                &ldquo;{enquiry.querySnippet}&rdquo;
              </p>

              {/* Product and Notes Footer */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-xs">
                <div className="text-[11px] text-stone-500">
                  {enquiry.productOfInterest && (
                    <span>Product: <strong className="text-stone-700">{enquiry.productOfInterest}</strong> • </span>
                  )}
                  {enquiry.notes && <span>{enquiry.notes}</span>}
                </div>

                {/* Status action toggle dropdown */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-stone-500">Change Status:</span>
                  <select
                    value={enquiry.status}
                    onChange={(e) =>
                      handleStatusChange(enquiry.id, e.target.value as EnquiryStatus)
                    }
                    className="text-xs bg-white border border-stone-200 rounded px-2 py-1 text-stone-800 focus:outline-hidden"
                  >
                    <option value="Open">Open</option>
                    <option value="Needs Human Follow-up">Needs Human Follow-up</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

