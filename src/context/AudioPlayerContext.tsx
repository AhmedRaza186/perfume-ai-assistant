'use client';

import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';

interface AudioPlayerContextType {
  activeAudioId: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playAudio: (id: string, url: string) => void;
  pauseAudio: () => void;
  seekAudio: (seconds: number) => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | null>(null);

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [activeAudioId, setActiveAudioId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      setActiveAudioId(null);
    };

    const onPause = () => {
      setIsPlaying(false);
    };

    const onPlay = () => {
      setIsPlaying(true);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('play', onPlay);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('play', onPlay);
    };
  }, []);

  const playAudio = useCallback((id: string, url: string) => {
    if (!audioRef.current) return;
    const audio = audioRef.current;

    // If currently active and playing the same track, toggle pause
    if (activeAudioId === id) {
      if (!audio.paused) {
        audio.pause();
      } else {
        audio.play().catch((err) => console.error('Audio play error', err));
      }
      return;
    }

    // New audio source requested
    audio.pause();
    audio.src = url;
    audio.currentTime = 0;
    setCurrentTime(0);
    setActiveAudioId(id);

    audio
      .play()
      .then(() => {
        setIsPlaying(true);
      })
      .catch((err) => {
        console.error('Audio playback failed', err);
        setIsPlaying(false);
        setActiveAudioId(null);
      });
  }, [activeAudioId]);

  const pauseAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const seekAudio = useCallback((seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  }, []);

  return (
    <AudioPlayerContext.Provider
      value={{
        activeAudioId,
        isPlaying,
        currentTime,
        duration,
        playAudio,
        pauseAudio,
        seekAudio,
      }}
    >
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider');
  }
  return context;
}
