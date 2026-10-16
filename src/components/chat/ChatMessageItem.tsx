'use client';

import React from 'react';
import { RotateCcw, AlertTriangle, UserCheck } from 'lucide-react';
import { ChatMessage } from '@/types/chat';
import { VoiceBubble } from './VoiceBubble';
import { ProductCard } from './ProductCard';
import { ComparisonCard } from './ComparisonCard';
import { isUrduText, formatMessageTime } from '@/utils/textUtils';

interface ChatMessageItemProps {
  message: ChatMessage;
  onRetry?: (messageId: string) => void;
  onAskAboutProduct?: (productName: string) => void;
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  message,
  onRetry,
  onAskAboutProduct,
}) => {
  const isCustomer = message.sender === 'customer';
  const textIsUrdu = isUrduText(message.text);

  return (
    <div
      className={`flex flex-col mb-4 ${
        isCustomer ? 'items-end' : 'items-start'
      }`}
    >
      {/* Bubble Container */}
      <div
        className={`max-w-[88%] sm:max-w-[80%] rounded-2xl p-3.5 transition-all ${
          isCustomer
            ? 'bg-[#343d35] text-stone-50 rounded-tr-sm'
            : 'bg-white text-stone-900 border border-stone-200/80 rounded-tl-sm shadow-[0_2px_8px_rgba(0,0,0,0.025)]'
        } ${message.isError ? 'border-red-300 bg-red-50/50' : ''}`}
      >
        {message.sender === 'human' && <p className="text-[11px] font-semibold text-stone-600 mb-1">Store team · Human reply</p>}
        {message.sender === 'system' && <p className="text-[11px] text-stone-500 mb-1">Conversation update</p>}
        {/* Error State Banner */}
        {message.isError && (
          <div className="flex items-center gap-2 mb-2 text-red-700 text-xs font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{message.errorMessage || 'Failed to deliver message'}</span>
          </div>
        )}

        {/* Text Message Content */}
        {message.text && (
          <div
            dir={textIsUrdu ? 'rtl' : 'ltr'}
            className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${
              textIsUrdu ? 'font-serif' : 'font-sans'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Voice Note Bubble */}
        {message.contentType === 'voice' && (
          <div className={message.text ? 'mt-2.5' : ''}>
            <VoiceBubble
              id={message.id}
              audioUrl={message.audioUrl}
              duration={message.audioDuration}
              transcript={message.transcript}
              isCustomer={isCustomer}
              isSampleAudio={message.isSampleAudio}
            />
          </div>
        )}

        {/* Product Recommendation Card */}
        {message.audioStatus === 'unavailable' && <p role="status" className="mt-2 text-xs text-stone-500">{isCustomer ? 'Recording unavailable or expired. Transcript-only access.' : 'Voice reply unavailable or expired. The answer text is shown above.'}</p>}
        {message.recommendation && (
          <ProductCard
            product={message.recommendation}
            onAskAboutProduct={onAskAboutProduct}
          />
        )}
        {message.recommendations?.map(product => <ProductCard key={product.id} product={product} onAskAboutProduct={onAskAboutProduct} />)}
        {message.comparison && <ComparisonCard products={message.comparison} />}

        {/* Human Help Confirmation Card */}
        {message.isHumanHelpConfirmation && (
          <div className="mt-2.5 p-2.5 rounded-lg bg-stone-100 border border-stone-200 text-stone-800 text-xs flex items-start gap-2.5">
            <UserCheck className="w-4 h-4 text-stone-700 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <p className="font-medium text-stone-900">Enquiry saved for review</p>
              <p className="text-stone-600">
                Your request was saved. A person may respond here later.
              </p>
            </div>
          </div>
        )}

        {/* Retry Button on Error */}
        {message.isError && message.canRetry && onRetry && (
          <div className="mt-2 pt-2 border-t border-red-200/60 flex justify-end">
            <button
              type="button"
              onClick={() => onRetry(message.id)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 hover:text-red-900 bg-white hover:bg-red-50 border border-red-200 px-2.5 py-1 rounded transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        )}
      </div>

      {/* Timestamp */}
      <span
        className={`text-[11px] text-stone-400 mt-1 px-1 select-none ${
          isCustomer ? 'text-right' : 'text-left'
        }`}
      >
        {formatMessageTime(message.timestamp)}
      </span>
    </div>
  );
};
