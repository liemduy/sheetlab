import { useRef, useState } from 'react';
import type { Score } from '../../domain/score/types';
import { playTimelineAudio } from '../playback/audioEngine';
import type { PlaybackController } from '../playback/audioEngine';
import {
  buildPlaybackTimeline,
  findPlaybackStartSecondsForEventId,
  getActiveTimelineEvents,
  getPlaybackScoreBeatAtSeconds,
  getTimelineDurationSeconds,
} from '../playback/timeline';
import type { PlaybackTimelineEvent } from '../playback/timeline';

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
  const [playbackStartOffsetSeconds, setPlaybackStartOffsetSeconds] =
    useState(0);
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
    setPlaybackStartOffsetSeconds(0);
    setEditorMessage('Playback stopped');
  }

  async function startPlayback(
    timeline: PlaybackTimelineEvent[],
    startSeconds: number,
    messages: {
      started: string;
      starting: string;
    },
  ) {
    const timelineDurationSeconds = getTimelineDurationSeconds(timeline);
    const safeStartSeconds = Math.min(
      Math.max(0, startSeconds),
      timelineDurationSeconds,
    );
    const remainingDurationSeconds =
      timelineDurationSeconds - safeStartSeconds;

    if (remainingDurationSeconds <= 0) {
      setEditorMessage('Nothing to play from this point');
      return;
    }

    setIsPlaying(true);
    setPlaybackElapsedSeconds(Number.NEGATIVE_INFINITY);
    setPlaybackStartOffsetSeconds(safeStartSeconds);
    setEditorMessage(messages.starting);
    const runId = playbackRunId.current + 1;
    playbackRunId.current = runId;
    const controller = await playTimelineAudio(timeline, {
      startSeconds: safeStartSeconds,
    });

    if (playbackRunId.current !== runId) {
      controller.stop();
      return;
    }

    playbackController.current = controller;
    setEditorMessage(messages.started);
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
      setPlaybackStartOffsetSeconds(0);
      setEditorMessage('Playback finished');
    }, Math.max(
      0,
      controller.startedAtMs -
        performance.now() +
        remainingDurationSeconds * 1000 +
        120,
    ));
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

    await startPlayback(timeline, 0, {
      started: 'Playback started',
      starting: 'Playback starting',
    });
  }

  async function handlePlaybackFromSelectedEvent(eventId: string | null) {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    const timeline = buildPlaybackTimeline(score);

    if (timeline.length === 0) {
      setEditorMessage('Nothing to play');
      return;
    }

    const startSeconds = findPlaybackStartSecondsForEventId(timeline, eventId);

    if (startSeconds === null) {
      setEditorMessage('Select a playable note or chord first');
      return;
    }

    await startPlayback(timeline, startSeconds, {
      started: 'Playback started from selected event',
      starting: 'Playback starting from selected event',
    });
  }

  const playbackTimeline = buildPlaybackTimeline(score);
  const isPlaybackClockStarted = playbackElapsedSeconds >= 0;
  const playbackClockSeconds = isPlaybackClockStarted
    ? playbackStartOffsetSeconds + playbackElapsedSeconds
    : playbackElapsedSeconds;
  const activePlaybackEvents = isPlaying && isPlaybackClockStarted
    ? getActiveTimelineEvents(playbackTimeline, playbackClockSeconds)
    : [];
  const activePlaybackEvent = activePlaybackEvents[0] ?? null;
  const playbackBeat = isPlaying && isPlaybackClockStarted
    ? getPlaybackScoreBeatAtSeconds(
        playbackTimeline,
        score.tempo,
        playbackClockSeconds,
      )
    : null;

  return {
    activePlaybackEvent,
    activePlaybackEventIds: [
      ...new Set(
        activePlaybackEvents.flatMap((event) =>
          event.sustainedEventIds ?? [event.id],
        ),
      ),
    ],
    handlePlaybackFromSelectedEvent,
    handlePlaybackToggle,
    isPlaying,
    playbackBeat,
  };
}
