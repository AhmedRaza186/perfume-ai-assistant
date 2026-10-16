'use client';

import React, { useState } from 'react';
import { Play, Pause, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { useAudioPlayer } from '@/context/AudioPlayerContext';
import { formatAudioDuration } from '@/utils/textUtils';

interface VoiceBubbleProps {
  id: string;
  audioUrl?: string;
  duration?: number;
  transcript?: string;
  isCustomer?: boolean;
  isSampleAudio?: boolean;
}

export const VoiceBubble: React.FC<VoiceBubbleProps> = ({
  id,
  audioUrl,
  duration = 0,
  transcript,
  isCustomer = false,
  isSampleAudio = false,
}) => {
  const { activeAudioId, isPlaying, currentTime, duration: activeDuration, playAudio, seekAudio } = useAudioPlayer();
  const [showTranscript, setShowTranscript] = useState(false);

  const isCurrentAudio = activeAudioId === id;
  const isThisPlaying = isCurrentAudio && isPlaying;

  // Use dynamic duration if actively playing, else fallback to prop duration
  const totalDuration = isCurrentAudio && activeDuration > 0 ? activeDuration : duration;
  const currentProgress = isCurrentAudio && totalDuration > 0 ? Math.min(1, currentTime / totalDuration) : 0;
  const displayTime = isCurrentAudio && currentTime > 0 ? currentTime : totalDuration;

  // Waveform bars count
  const barsCount = 24;
  // Deterministic wave heights for consistent neat appearance
  const barHeights = [
    25, 45, 70, 90, 60, 40, 65, 85, 100, 75, 50, 60, 80, 95, 70, 50, 40, 60, 75, 55, 40, 35, 50, 30,
  ];

  const handleTogglePlay = () => {
    if (!audioUrl) return;
    playAudio(id, audioUrl);
  };

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioUrl || !totalDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    seekAudio(ratio * totalDuration);
  };

  if (!audioUrl) {
    return (
      <div className="p-2.5 rounded-lg bg-stone-100 text-stone-600 text-xs border border-stone-200 space-y-2">
        <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-stone-500 shrink-0" />
        <span>Audio recording unavailable for this message.</span>
        </div>
        {transcript && <p dir="auto" className="whitespace-pre-wrap break-words">{transcript}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 w-full max-w-[280px] sm:max-w-[320px]">
      {/* Voice Player Bar */}
      <div
        className={`flex items-center gap-3 py-2 px-3 rounded-lg border transition-colors ${
          isCustomer
            ? 'bg-stone-900 text-white border-stone-800'
            : 'bg-stone-50 text-stone-900 border-stone-200'
        }`}
      >
        {/* Play / Pause Toggle Button */}
        <button
          type="button"
          onClick={handleTogglePlay}
          aria-label={isThisPlaying ? 'Pause audio' : 'Play audio'}
          className={`flex items-center justify-center w-8 h-8 rounded-full transition-transform active:scale-95 shrink-0 ${
            isCustomer
              ? 'bg-white text-stone-900 hover:bg-stone-100'
              : 'bg-stone-800 text-white hover:bg-stone-900'
          }`}
        >
          {isThisPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>

        {/* Compact Waveform Scrubber */}
        <div
          role="slider"
          aria-label="Audio progress scrubber"
          aria-valuenow={Math.round(currentProgress * 100)}
          tabIndex={0}
          onClick={handleScrub}
          className="flex-1 flex items-center gap-[3px] h-6 cursor-pointer py-1"
        >
          {barHeights.slice(0, barsCount).map((heightPercent, index) => {
            const barProgress = index / barsCount;
            const isFilled = isCurrentAudio && currentProgress >= barProgress;
            return (
              <span
                key={index}
                style={{ height: `${heightPercent}%` }}
                className={`w-[3px] rounded-full transition-colors ${
                  isCustomer
                    ? isFilled
                      ? 'bg-white'
                      : 'bg-stone-600'
                    : isFilled
                    ? 'bg-stone-900'
                    : 'bg-stone-300'
                }`}
              />
            );
          })}
        </div>

        {/* Duration */}
        <span
          className={`text-xs font-mono font-medium tracking-tight shrink-0 ${
            isCustomer ? 'text-stone-300' : 'text-stone-600'
          }`}
        >
          {formatAudioDuration(displayTime)}
        </span>
      </div>

      {/* Honest Local Demo Badge for Assistant Sample Audio */}
      {isSampleAudio && (
        <span className="text-[11px] text-stone-500 italic pl-1">
          Demo sample audio • Simulated voice response
        </span>
      )}

      {/* Optional Transcript Section */}
      {transcript && (
        <div className="mt-0.5">
          <button
            type="button"
            onClick={() => setShowTranscript(!showTranscript)}
            className="flex items-center gap-1 text-[11px] font-medium text-stone-600 hover:text-stone-900 transition-colors pl-1 py-0.5"
          >
            <span>{showTranscript ? 'Hide transcript' : 'View transcript'}</span>
            {showTranscript ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {showTranscript && (
            <div className="mt-1 p-2 rounded-md bg-stone-100/80 border border-stone-200 text-stone-700 text-xs leading-relaxed">
              <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider block mb-0.5">
                Transcript
              </span>
              {transcript}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
