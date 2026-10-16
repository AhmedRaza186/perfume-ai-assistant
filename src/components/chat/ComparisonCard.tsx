import type { ProductRecommendationSummary } from '@/types/chat';
import { formatPrice } from '@/utils/textUtils';

export function ComparisonCard({ products }: { products: ProductRecommendationSummary[] }) {
  return <section aria-label="Perfume comparison" className="mt-3 space-y-2 min-w-0">
    {products.map(product => <div key={product.id} className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs min-w-0 break-words">
      <h3 className="font-semibold text-sm mb-2">{product.name}</h3>
      <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-2 gap-y-1">
        <dt>Price</dt><dd>{formatPrice(product.price)}</dd>
        <dt>Size</dt><dd>{product.size || 'Unknown'}</dd>
        <dt>Family</dt><dd>{product.families?.join(', ') || 'Unknown'}</dd>
        <dt>Notes</dt><dd>{product.notes || 'Unknown'}</dd>
        <dt>Use</dt><dd>{product.useGuidance || 'Unknown'}</dd>
        <dt>Availability</dt><dd>{product.inStock === true ? 'Recorded in stock' : product.inStock === false ? 'Recorded out of stock' : 'Unknown'}</dd>
      </dl>
      {product.dataSource === 'demo' && <p className="text-stone-500 mt-2">Fictional demo catalogue data</p>}
    </div>)}
  </section>;
}
