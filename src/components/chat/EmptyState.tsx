'use client';

import React from 'react';
import { Sparkles, Gift, Truck, Flower2 } from 'lucide-react';
import { SuggestionOption } from '@/types/chat';

interface EmptyStateProps {
  onSelectSuggestion: (prompt: string) => void;
}

const SUGGESTIONS: (SuggestionOption & { icon: React.ReactNode })[] = [
  {
    id: 'fresh-perfumes',
    label: 'Fresh perfumes',
    promptText: 'Mujhe daily use ke liye koi fresh fragrance recommend karein.',
    icon: <Sparkles className="w-3.5 h-3.5 text-stone-600" />,
  },
  {
    id: 'gift-suggestions',
    label: 'Gift suggestions',
    promptText: 'Kisi khas ke liye gift dena hai, kya suggest karein ge?',
    icon: <Gift className="w-3.5 h-3.5 text-stone-600" />,
  },
  {
    id: 'delivery-payment',
    label: 'Delivery & payment',
    promptText: 'Delivery charges kitne hain aur Cash on Delivery ka kya procedure hai?',
    icon: <Truck className="w-3.5 h-3.5 text-stone-600" />,
  },
];

export const EmptyState: React.FC<EmptyStateProps> = ({ onSelectSuggestion }) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto my-auto animate-fade-in">
      {/* Restrained welcome header */}
      <div className="mb-6 rounded-full border border-[#dfd1b9] bg-[#f5efe4] p-5 text-[#80643b]"><Flower2 size={36} strokeWidth={1.2} /></div>
      <p className="text-[10px] tracking-[0.22em] uppercase text-[#80643b] mb-3">A scent that feels like you</p>
      <h2 className="text-2xl sm:text-3xl font-serif text-stone-800 mb-3 leading-tight">
        Kis tarah ki fragrance dhoond rahe hain?
      </h2>
      <p className="text-xs sm:text-sm text-stone-500 mb-6 max-w-xs leading-relaxed">
        Perfumes ke notes, delivery policies ya gift options ke baray mein sawal poochein.
      </p>

      {/* Suggestion action buttons */}
      <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-2 w-full">
        {SUGGESTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectSuggestion(item.promptText)}
            className="flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium text-stone-700 bg-white hover:bg-[#f5efe4] border border-stone-200/90 rounded-xl hover:border-[#c6b08b] transition-colors active:scale-98"
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
