'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, Square, X, Trash2, Play, Pause, AlertCircle } from 'lucide-react';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { useAudioPlayer } from '@/context/AudioPlayerContext';
import { formatAudioDuration } from '@/utils/textUtils';

interface ChatComposerProps {
  onSendMessage: (text: string) => void;
  onSendVoiceMessage: (audioBlob: Blob, durationSeconds: number, audioUrl: string) => void;
  disabled?: boolean;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  onSendMessage,
  onSendVoiceMessage,
  disabled = false,
}) => {
  const [inputText, setInputText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const {
    status: recorderStatus,
    recordingDuration,
    audioBlob,
    audioUrl,
    permissionError,
    startRecording,
    stopRecording,
    cancelRecording,
    discardRecording,
    clearError,
  } = useVoiceRecorder();

  // Preview audio playback state for recorded voice note
  const { activeAudioId, isPlaying, playAudio, pauseAudio } = useAudioPlayer();
  const isPreviewPlaying = !!activeAudioId?.startsWith('recording-preview-') && isPlaying;

  // Auto-adjust textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 120);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [inputText]);

  // Clean preview player when recorder status changes
  useEffect(() => {
    if (recorderStatus !== 'previewing' && activeAudioId?.startsWith('recording-preview-')) pauseAudio();
  }, [recorderStatus, activeAudioId, pauseAudio]);

  const handleSendText = () => {
    const trimmed = inputText.trim();
    if (!trimmed || disabled) return;
    onSendMessage(trimmed);
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const handleTogglePreviewPlay = () => {
    if (!audioUrl) return;
    playAudio(`recording-preview-${audioUrl}`, audioUrl);
  };

  const handleSendVoice = () => {
    if (!audioBlob || !audioUrl) return;
    const duration = recordingDuration > 0 ? recordingDuration : 1;
    onSendVoiceMessage(audioBlob, duration, audioUrl);
    discardRecording();
  };

  return (
    <div className="border-t border-stone-200/80 bg-white px-4 sm:px-6 py-4 safe-bottom">
      {/* Microphone Permission Warning Message */}
      {permissionError && (
        <div className="mb-2.5 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{permissionError}</span>
          </div>
          <button
            type="button"
            onClick={clearError}
            aria-label="Dismiss error"
            className="text-amber-700 hover:text-amber-900 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* STATE 1: Active Recording State */}
      {recorderStatus === 'recording' && (
        <div className="flex items-center justify-between bg-stone-50 border border-stone-200 rounded-xl p-2.5 px-3.5 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
            <span className="text-xs font-medium text-stone-700">Recording audio...</span>
            <span className="text-xs font-mono font-medium text-stone-900 pl-1">
              {formatAudioDuration(recordingDuration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Cancel Button */}
            <button
              type="button"
              onClick={cancelRecording}
              className="text-xs font-medium text-stone-600 hover:text-stone-900 px-2 py-1 rounded transition-colors"
            >
              Cancel
            </button>

            {/* Stop Button */}
            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Stop</span>
            </button>
          </div>
        </div>
      )}

      {/* STATE 2: Recording Preview State */}
      {recorderStatus === 'previewing' && (
        <div className="flex items-center justify-between bg-stone-50 border border-stone-200 rounded-xl p-2.5 px-3.5 animate-fade-in">
          <div className="flex items-center gap-2.5">
            {/* Play / Pause Preview */}
            <button
              type="button"
              onClick={handleTogglePreviewPlay}
              className="flex items-center justify-center w-7 h-7 rounded-full bg-stone-900 text-white hover:bg-stone-800 transition-colors"
              aria-label={isPreviewPlaying ? 'Pause preview' : 'Play preview'}
            >
              {isPreviewPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              )}
            </button>

            <span className="text-xs text-stone-600">Voice note preview</span>
            <span className="text-xs font-mono font-medium text-stone-900">
              {formatAudioDuration(recordingDuration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Discard Button */}
            <button
              type="button"
              onClick={discardRecording}
              className="p-1.5 text-stone-500 hover:text-red-700 transition-colors rounded"
              title="Discard recording"
              aria-label="Discard recording"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Send Voice Note Button */}
            <button
              type="button"
              onClick={handleSendVoice}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Send className="w-3 h-3" />
              <span>Send voice note</span>
            </button>
          </div>
        </div>
      )}

      {/* STATE 3: Standard Text / Mic Composer */}
      {recorderStatus === 'idle' && (
        <div className="flex items-end gap-2 bg-[#faf9f6] border border-stone-200 rounded-2xl p-2 focus-within:border-[#b49a70] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#ede4d4] transition-all">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Apna sawaal likhein…"
            aria-label="Your message"
            disabled={disabled}
            className="flex-1 resize-none bg-transparent py-1.5 px-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-hidden max-h-32 leading-relaxed"
          />

          <div className="flex items-center gap-1 shrink-0 pb-0.5 pr-0.5">
            {/* Mic Button */}
            <button
              type="button"
              onClick={startRecording}
              disabled={disabled}
              title="Record voice note"
              aria-label="Record voice note"
              className="p-2 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <Mic className="w-4 h-4" />
            </button>

            {/* Send Button */}
            <button
              type="button"
              onClick={handleSendText}
              disabled={!inputText.trim() || disabled}
              title="Send message"
              aria-label="Send message"
              className="p-2.5 bg-[#343d35] text-white hover:bg-[#465247] disabled:opacity-30 rounded-xl transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
