'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, RotateCcw, AlertCircle } from 'lucide-react';

export type AdminTab = 'products' | 'policies' | 'enquiries' | 'orders' | 'conversations' | 'knowledge';

interface AdminHeaderProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  onResetData: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  activeTab,
  onTabChange,
  onResetData,
}) => {
  return (
    <header className="border-b border-stone-200 bg-white">
      {/* Top Banner: Notice */}
      <div className="bg-stone-100 border-b border-stone-200/80 px-4 py-1.5 flex items-center justify-between text-xs text-stone-600">
        <div className="flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-stone-500 shrink-0" />
          <span>
            <strong>Store Management:</strong> Changes are saved to the server and used by the assistant.
          </span>
        </div>
        <button
          type="button"
          onClick={onResetData}
          className="flex items-center gap-1 text-[11px] font-medium text-stone-600 hover:text-stone-900 bg-stone-200/60 hover:bg-stone-200 px-2 py-0.5 rounded transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset Demo Data</span>
        </button>
      </div>

      {/* Main Navigation Row */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Customer Chat</span>
          </Link>
          <div className="h-4 w-[1px] bg-stone-200" />
          <div>
            <h1 className="text-base font-semibold text-stone-900 tracking-tight">
              Store Administration
            </h1>
          </div>
        </div>

        {/* Tab Buttons */}
        <nav className="flex flex-wrap items-center gap-1 bg-stone-100 p-1 rounded-lg">
          {(['orders', 'conversations', 'knowledge'] as const).map(tab => <button key={tab} type="button" onClick={() => onTabChange(tab)} className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize ${activeTab === tab ? 'bg-white shadow-2xs text-stone-900' : 'text-stone-600'}`}>{tab}</button>)}
          <button
            type="button"
            onClick={() => onTabChange('products')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'products'
                ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Products
          </button>
          <button
            type="button"
            onClick={() => onTabChange('policies')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'policies'
                ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Policies
          </button>
          <button
            type="button"
            onClick={() => onTabChange('enquiries')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'enquiries'
                ? 'bg-white text-stone-900 shadow-2xs font-semibold'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Enquiries
          </button>
        </nav>
      </div>
    </header>
  );
};

