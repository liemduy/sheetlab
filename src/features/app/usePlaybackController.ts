import { useRef, useState } from 'react';
import type { Score } from '../../domain/score/types';
import { playTimelineAudio } from '../playback/audioEngine';
import type { PlaybackController } from '../playback/audioEngine';
import {
  buildPlaybackTimeline,
  getActiveTimelineEvents,
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
  const playbackController = useRef<PlaybackController | null>(null);
  const playbackEndTimer = useRef<number | null>(null);
  const playbackAnimationFrame = useRef<number | null>(null);
  const playbackRunId = useRef(0);

  function stopPlayback() {
    playbackRunId.current += 1;
    playbackController.current?.stop();
    playbackController.current = null;

    if (playbackEndTimer.current !== null) {
      window.clearTimeout(playbackEndTimer.current);
      playbackEndTimer.current = null;
    }

    if (playbackAnimationFrame.current !== null) {
      window.cancelAnimationFrame(playbackAnimationFrame.current);
      playbackAnimationFrame.current = null;
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
    setPlaybackElapsedSeconds(Number.NEGATIVE_INFINITY);
    setEditorMessage('Playback starting');
    const runId = playbackRunId.current + 1;
    playbackRunId.current = runId;
    const controller = await playTimelineAudio(timeline);

    if (playbackRunId.current !== runId) {
      controller.stop();
      return;
    }

    playbackController.current = controller;
    setEditorMessage('Playback started');
    const updatePlaybackClock = () => {
      setPlaybackElapsedSeconds(
        (performance.now() - controller.startedAtMs) / 1000,
      );
      playbackAnimationFrame.current =
        window.requestAnimationFrame(updatePlaybackClock);
    };
    updatePlaybackClock();
    playbackEndTimer.current = window.setTimeout(() => {
      playbackController.current?.stop();
      playbackController.current = null;
      playbackEndTimer.current = null;
      if (playbackAnimationFrame.current !== null) {
        window.cancelAnimationFrame(playbackAnimationFrame.current);
        playbackAnimationFrame.current = null;
      }
      setIsPlaying(false);
      setPlaybackElapsedSeconds(0);
      setEditorMessage('Playback finished');
    }, Math.max(
      0,
      controller.startedAtMs -
        performance.now() +
        getTimelineDurationSeconds(timeline) * 1000 +
        120,
    ));
  }

  const playbackTimeline = buildPlaybackTimeline(score);
  const isPlaybackClockStarted = playbackElapsedSeconds >= 0;
  const activePlaybackEvents = isPlaying && isPlaybackClockStarted
    ? getActiveTimelineEvents(playbackTimeline, playbackElapsedSeconds)
    : [];
  const activePlaybackEvent = activePlaybackEvents[0] ?? null;
  const playbackBeat = isPlaying && isPlaybackClockStarted
    ? getPlaybackScoreBeatAtSeconds(
        playbackTimeline,
        score.tempo,
        playbackElapsedSeconds,
      )
    : null;

  return {
    activePlaybackEvent,
    activePlaybackEventIds: activePlaybackEvents.map((event) => event.id),
    handlePlaybackToggle,
    isPlaying,
    playbackBeat,
  };
}
