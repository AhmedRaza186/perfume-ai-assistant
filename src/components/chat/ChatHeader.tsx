'use client';

import React from 'react';

import { RotateCcw, Flower2 } from 'lucide-react';

interface ChatHeaderProps {
  onNewConversation: () => void;
  hasMessages: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ onNewConversation, hasMessages }) => {
  return (
    <header className="flex items-center justify-between px-5 sm:px-7 py-5 border-b border-stone-200/70 bg-white/95 select-none">
      {/* Store Identity */}
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-[#f3ede2] p-3 text-[#80643b]"><Flower2 size={23} strokeWidth={1.4} /></div>
        <div><h1 className="text-lg font-serif tracking-tight text-stone-900">
          Perfume Store
        </h1>
        <span className="text-xs text-stone-500 font-normal">
          Your fragrance companion
        </span></div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        {/* Discreet new conversation action */}
        {hasMessages && (
          <button
            type="button"
            onClick={onNewConversation}
            title="Start new conversation"
            aria-label="New conversation"
            className="flex items-center gap-1.5 text-xs text-stone-600 hover:text-stone-900 hover:bg-stone-100 px-2.5 py-1.5 rounded-md transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-stone-500" />
            <span className="hidden sm:inline">New conversation</span>
          </button>
        )}


      </div>
    </header>
  );
};

