export type MessageSender = 'customer' | 'assistant' | 'human' | 'system';
export type MessageContentType = 'text' | 'voice';

export interface ProductRecommendationSummary {
  id: string;
  name: string;
  size: string;
  price: number;
  description: string;
  image: string;
  notes?: string;
  families?: string[];
  useGuidance?: string;
  inStock?: boolean | null;
  dataSource?: 'demo' | 'business';
  reason?: string;
}

export interface ChatMessage {
  id: string;
  sender: MessageSender;
  contentType: MessageContentType;
  text?: string;
  audioUrl?: string;
  audioDuration?: number; // duration in seconds
  audioStatus?: 'ready' | 'unavailable';
  transcript?: string;
  isSampleAudio?: boolean; // honest indicator if using local demo sample
  timestamp: string;
  recommendation?: ProductRecommendationSummary;
  recommendations?: ProductRecommendationSummary[];
  comparison?: ProductRecommendationSummary[];
  isError?: boolean;
  errorMessage?: string;
  canRetry?: boolean;
  isHumanHelpConfirmation?: boolean;
}

export interface SuggestionOption {
  id: string;
  label: string;
  promptText: string;
}
