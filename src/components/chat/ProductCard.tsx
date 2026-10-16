'use client';

import React from 'react';
import Image from 'next/image';
import { MessageSquarePlus } from 'lucide-react';
import { ProductRecommendationSummary } from '@/types/chat';
import { formatPrice } from '@/utils/textUtils';

interface ProductCardProps {
  product: ProductRecommendationSummary;
  onAskAboutProduct?: (productName: string) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, onAskAboutProduct }) => {
  return (
    <div className="mt-2.5 rounded-lg border border-stone-200 bg-white p-3 max-w-sm transition-shadow hover:shadow-xs">
      <div className="flex gap-3">
        {/* Product Image */}
        <div className="relative w-16 h-16 rounded-md bg-stone-100 overflow-hidden shrink-0 border border-stone-200/60">
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="64px"
            className="object-cover"
          />
        </div>

        {/* Product Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <h4 className="font-medium text-stone-900 text-sm truncate">{product.name}</h4>
            <span className="font-semibold text-stone-900 text-sm shrink-0">
              {formatPrice(product.price)}
            </span>
          </div>

          <p className="text-xs text-stone-500 font-medium mb-1">{product.size}</p>

          <p className="text-xs text-stone-600 line-clamp-2 leading-relaxed">
            {product.reason || product.description}
          </p>
        </div>
      </div>

      {/* Action: Ask about this product */}
      {onAskAboutProduct && (
        <div className="mt-2.5 pt-2 border-t border-stone-100 flex items-center justify-between">
          <span className="text-[11px] text-stone-500">{product.dataSource === 'demo' ? 'Fictional demo item' : 'Catalogue item'}</span>
          <button
            type="button"
            onClick={() => onAskAboutProduct(product.name)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-800 hover:text-stone-950 bg-stone-100 hover:bg-stone-200/80 px-2.5 py-1 rounded transition-colors"
          >
            <MessageSquarePlus className="w-3.5 h-3.5 text-stone-600" />
            <span>Ask about this</span>
          </button>
        </div>
      )}
    </div>
  );
};
