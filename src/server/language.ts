export type ReplyLanguage = 'english' | 'roman-urdu' | 'urdu';

function detect(text: string, voice = false): ReplyLanguage | undefined {
  if (/\b(?:roman\s*urdu|urdu\s*(?:in|using)\s*(?:english|latin)\s*(?:letters|script))\b/i.test(text)) return 'roman-urdu';
  if (/\b(?:reply|respond|answer|speak)\s+(?:to me\s+)?in\s+english\b/i.test(text)) return 'english';
  if (/\b(?:urdu script|urdu mein likh|urdu me likh)\b/i.test(text)) return 'urdu';
  // Urdu speech can be transcribed in Devanagari. Script alone must not select English.
  if (/[\u0900-\u097f]/.test(text)) return 'roman-urdu';
  if (/[\u0600-\u06ff]/.test(text)) return voice ? 'roman-urdu' : 'urdu';
  if (/\b(mujhe|muje|mjhe|mjy|mein|mai|chahiye|chaiye|chahye|chahta|chahti|chahtay|chahte|hai|hain|hy|han|hn|ka|ki|ke|aur|kya|kia|liye|lye|mera|meri|aap|apko|batao|batayein|btao|batain|dikhao|acha|achha|konsa|kaunsa|konsi|bhai|jee|ji|nahi|nahin|krna|karna|karo|karein|wala|wali)\b/i.test(text)) return 'roman-urdu';
  if (/\b(what|which|would|could|please|recommend|suggest|compare|looking|want|need|show|tell|thanks|thank|hello)\b/i.test(text)) return 'english';
}

export function replyLanguage(query: string, customerHistory: string[] = [], voice = false): ReplyLanguage {
  return detect(query, voice) || [...customerHistory].reverse().map(text => detect(text)).find(Boolean) || 'english';
}

export function wording(language: ReplyLanguage, english: string, roman: string, urdu: string): string {
  return language === 'urdu' ? urdu : language === 'roman-urdu' ? roman : english;
}

export function languageInstruction(language: ReplyLanguage): string {
  return language === 'roman-urdu'
    ? 'Reply language: Roman Urdu. Write natural Pakistani Urdu in Latin letters, e.g. "Jee, yeh perfume aap ke budget mein hai." Do not switch to English sentences, Urdu script or Devanagari. Product names, recorded fragrance notes and supported payment method names may stay unchanged.'
    : language === 'urdu' ? 'Reply language: Urdu in Urdu script. Keep exact product names and recorded facts unchanged.'
      : 'Reply language: English. Keep exact product names and recorded facts unchanged.';
}
