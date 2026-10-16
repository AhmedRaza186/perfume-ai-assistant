'use client';

import React from 'react';

export const TypingIndicator: React.FC = () => {
  return (
    <div className="flex items-start mb-4 animate-fade-in">
      <div className="bg-white border border-stone-200/80 rounded-2xl rounded-tl-xs px-3.5 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-pulse" />
        <span className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-pulse [animation-delay:200ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-pulse [animation-delay:400ms]" />
        <span className="text-xs text-stone-400 font-medium ml-1">Thinking...</span>
      </div>
    </div>
  );
};
