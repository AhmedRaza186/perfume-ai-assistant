import type { ChatMessage, ProductRecommendationSummary } from './chat';
import type { Product } from './product';

export type ConversationState = 'AI_ACTIVE' | 'HANDOFF_REQUESTED' | 'HUMAN_ACTIVE';
export type ReplyFormat = 'match' | 'text';
export type OrderStatus = 'New' | 'Reviewing' | 'Contacted' | 'Closed';
export interface OrderDetails {
  productId?: string; quantity?: number; customerName?: string; phone?: string;
  address?: string; city?: string; paymentMethod?: string;
}
export interface OrderDraft extends OrderDetails {
  id: string; revision: number; missing: string[]; product?: ProductRecommendationSummary;
  subtotal: number | null; deliveryCharge: number | null; total: number | null;
  eligibility: string; quoteToken: string; ready: boolean; submittedReference?: string;
  requestStatus?: OrderStatus;
}
export interface OrderRequest {
  id: string; reference: string; conversationId: string; draftId: string;
  details: OrderDetails; product: ProductRecommendationSummary;
  subtotal: number; deliveryCharge: number | null; total: number | null;
  eligibility: string; status: OrderStatus; notes: string; created: number; revision: number;
}
export interface KnowledgeEntry {
  id: string; title: string; content: string; active: boolean;
  kind: 'FAQ' | 'Product guidance' | 'Business information'; revision: number;
  warnings?: string[];
}
export interface ConversationSnapshot {
  conversationId?: string; state: ConversationState; messages: ChatMessage[];
  replyFormat: ReplyFormat; draft?: OrderDraft; orderRequests: OrderRequest[];
  catalogue: Product[]; paymentMethods: string[];
}
