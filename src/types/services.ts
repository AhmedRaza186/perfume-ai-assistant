import { ChatMessage, ProductRecommendationSummary } from './chat';
import type { ConversationState, OrderDraft, ReplyFormat } from './workflow';

/** HTTP service contracts. Conversation history is maintained by the server; legacy client history is ignored. */

export interface TextQueryRequest {
  query: string;
  requestId?: string;
  conversationHistory?: ChatMessage[];
}

export interface VoiceQueryRequest {
  audioBlob: Blob;
  requestId?: string;
  audioDurationSeconds: number;
  replyFormat?: ReplyFormat;
  conversationHistory?: ChatMessage[];
}

export interface AssistantServiceResponse {
  text: string;
  conversationId?: string;
  audioStatus?: 'ready' | 'unavailable';
  audioUnavailableReason?: string;
  recommendation?: ProductRecommendationSummary;
  recommendations?: ProductRecommendationSummary[];
  comparison?: ProductRecommendationSummary[];
  state?: ConversationState;
  responseType?: 'ai' | 'receipt' | 'workflow';
  draft?: OrderDraft;
  orderReference?: string;
  audioUrl?: string;
  audioDuration?: number;
  transcript?: string;
  isHumanHelpTriggered?: boolean;
}

export interface IAnswerService {
  processTextMessage(request: TextQueryRequest): Promise<AssistantServiceResponse>;
  processVoiceMessage(request: VoiceQueryRequest): Promise<AssistantServiceResponse>;
}

export interface ITranscriptionService {
  transcribe(audioBlob: Blob): Promise<{ text: string; confidence?: number }>;
}

export interface ISpeechService {
  synthesizeSpeech(text: string): Promise<{ audioUrl: string; duration: number }>;
}

