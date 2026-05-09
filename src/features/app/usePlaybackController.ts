import { useRef, useState } from 'react';
import type { Score } from '../../domain/score/types';
import { playTimelineAudio } from '../playback/audioEngine';
import {
  buildPlaybackTimeline,
  getActiveTimelineEvent,
  getPlaybackScoreBeatAtSeconds,
  getTimelineDurationSeconds,
} from '../playback/timeline';

interface UsePlaybackControllerOptions {
  score: Score;
  setEditorMessage: (message: string) => void;
}

export function usePlaybackController({
  score,
  setEditorMessage,
}: UsePlaybackControllerOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackElapsedSeconds, setPlaybackElapsedSeconds] = useState(0);
  const playbackController = useRef<{ stop: () => void } | null>(null);
  const playbackEndTimer = useRef<number | null>(null);
  const playbackInterval = useRef<number | null>(null);

  function stopPlayback() {
    playbackController.current?.stop();
    playbackController.current = null;

    if (playbackEndTimer.current !== null) {
      window.clearTimeout(playbackEndTimer.current);
      playbackEndTimer.current = null;
    }

    if (playbackInterval.current !== null) {
      window.clearInterval(playbackInterval.current);
      playbackInterval.current = null;
    }

    setIsPlaying(false);
    setPlaybackElapsedSeconds(0);
    setEditorMessage('Playback stopped');
  }

  async function handlePlaybackToggle() {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    const timeline = buildPlaybackTimeline(score);

    if (timeline.length === 0) {
      setEditorMessage('Nothing to play');
      return;
    }

    setIsPlaying(true);
    setPlaybackElapsedSeconds(0);
    setEditorMessage('Playback started');
    const startedAt = performance.now();
    playbackInterval.current = window.setInterval(() => {
      setPlaybackElapsedSeconds((performance.now() - startedAt) / 1000);
    }, 50);
    playbackController.current = await playTimelineAudio(timeline);
    playbackEndTimer.current = window.setTimeout(() => {
      playbackController.current?.stop();
      playbackController.current = null;
      playbackEndTimer.current = null;
      if (playbackInterval.current !== null) {
        window.clearInterval(playbackInterval.current);
        playbackInterval.current = null;
      }
      setIsPlaying(false);
      setPlaybackElapsedSeconds(0);
      setEditorMessage('Playback finished');
    }, getTimelineDurationSeconds(timeline) * 1000 + 120);
  }

  const playbackTimeline = buildPlaybackTimeline(score);
  const activePlaybackEvent = isPlaying
    ? getActiveTimelineEvent(playbackTimeline, playbackElapsedSeconds)
    : null;
  const playbackBeat = isPlaying
    ? getPlaybackScoreBeatAtSeconds(
        playbackTimeline,
        score.tempo,
        playbackElapsedSeconds,
      )
    : null;

  return {
    activePlaybackEvent,
    handlePlaybackToggle,
    isPlaying,
    playbackBeat,
  };
}
