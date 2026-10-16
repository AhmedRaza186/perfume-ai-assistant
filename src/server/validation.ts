import { z } from 'zod';
import { PublicError } from './http';
import { MAX_VOICE_SECONDS } from '@/config/voice';

const text = z.string().trim().min(1).max(2000);
export const querySchema = z.object({ query: text, conversationId: z.string().uuid().optional(), requestId: z.string().uuid() });
export const voiceSchema = z.object({ conversationId: z.string().uuid().optional(), requestId: z.string().uuid(), audioDurationSeconds: z.coerce.number().min(0.1).max(MAX_VOICE_SECONDS + 1) });
export const productSchema = z.object({
  id: z.string().regex(/^prod-[a-zA-Z0-9-]+$/).max(100), name: text.max(120), size: text.max(120),
  price: z.number().finite().min(0).max(1_000_000), description: text, notes: z.string().max(2000).optional(),
  category: z.enum(['fresh', 'oriental', 'floral', 'woody']), image: z.string().regex(/^\/images\/products\/[a-zA-Z0-9_-]+\.(svg|png|jpg|webp)$/), inStock: z.boolean().nullable(),
  bottleSizeMl: z.number().int().min(1).max(5000).optional(),
  families: z.array(z.enum(['fresh', 'floral', 'woody', 'sweet', 'oud'])).max(5).optional(),
  occasions: z.array(z.enum(['office', 'daily', 'gift', 'evening'])).max(4).optional(),
  useGuidance: z.string().trim().max(1000).optional(), dataSource: z.enum(['demo', 'business']).optional(),
});
export const productsSchema = z.array(productSchema).max(100).refine(items => new Set(items.map(p => p.id)).size === items.length);
export const policiesSchema = z.object({
  delivery: z.object({ standardDuration: text, charges: text, cities: text, freeDeliveryThreshold: z.number().min(0).max(1_000_000), additionalNotes: z.string().max(2000).optional(), rules: z.array(z.object({ cities: z.array(text.max(100)).min(1).max(50), charge: z.number().min(0).max(100000), freeAbove: z.number().min(0).max(1000000).optional() })).max(20).optional() }),
  payment: z.object({ codAvailable: z.boolean(), advanceRequired: text, onlineMethods: z.array(text.max(200)).max(20), bankDetails: z.string().max(2000).optional() }),
  returns: z.object({ windowDays: z.number().int().min(0).max(365), conditions: text, exchangePolicy: text }),
});
export const enquiryUpdateSchema = z.object({ id: z.string().uuid(), status: z.enum(['Open', 'Resolved', 'Needs Human Follow-up']), notes: z.string().max(2000).optional() });
export const orderDetailsSchema = z.object({
  productId: z.string().max(100).optional(), quantity: z.number().int().min(1).max(100).optional(),
  customerName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,25}$/).refine(v => v.replace(/\D/g, '').length >= 7 && v.replace(/\D/g, '').length <= 15, 'Enter a valid phone number.').optional(),
  address: z.string().trim().min(5).max(500).optional(), city: z.string().trim().min(2).max(100).optional(),
  paymentMethod: z.string().trim().min(1).max(200).optional(),
}).strict();
export const knowledgeSchema = z.object({ id: z.string().uuid(), title: text.max(120), content: text.max(2000), active: z.boolean(), kind: z.enum(['FAQ', 'Product guidance', 'Business information']), revision: z.number().int().min(0) }).strict();
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new PublicError(400, 'Some fields are missing or invalid. Check the field details and try again.', 'invalid_input',
    result.error.issues.slice(0, 10).map(issue => ({ field: issue.path.join('.') || 'request', message: issue.message })));
  return result.data;
}
