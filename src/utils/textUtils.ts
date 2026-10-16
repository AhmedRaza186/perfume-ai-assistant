/**
 * Determines whether text is predominantly right-to-left (Urdu/Arabic script).
 * Roman Urdu and English remain LTR.
 */
export function isUrduText(text?: string): boolean {
  if (!text) return false;
  // Arabic and Urdu Unicode block: 0600-06FF, 0750-077F, 08A0-08FF, FB50-FDFF, FE70-FEFF
  const rtlRegex = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  const matches = text.match(rtlRegex);
  if (!matches) return false;
  return matches.length > text.trim().length * 0.3;
}

/**
 * Format currency in PKR
 */
export function formatPrice(amount: number): string {
  return `PKR ${amount.toLocaleString()}`;
}

/**
 * Format audio duration in mm:ss
 */
export function formatAudioDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Format current timestamp for chat messages
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

export function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
