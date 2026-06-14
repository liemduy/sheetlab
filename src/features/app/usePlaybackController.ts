import { useMemo, useRef, useState } from 'react';
import type { Score } from '../../domain/score/types';
import { playTimelineAudio, warmUpPlaybackAudio } from '../playback/audioEngine';
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

function getControllerElapsedSeconds(controller: PlaybackController | null) {
  if (!controller) {
    return 0;
  }

  return (
    controller.getElapsedSeconds?.() ??
    (performance.now() - controller.startedAtMs) / 1000
  );
}

export function usePlaybackController({
  score,
  setEditorMessage,
}: UsePlaybackControllerOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [playbackElapsedSeconds, setPlaybackElapsedSeconds] = useState(0);
  const [playbackStartOffsetSeconds, setPlaybackStartOffsetSeconds] =
    useState(0);
  const playbackController = useRef<PlaybackController | null>(null);
  const playbackAnimationFrame = useRef<number | null>(null);
  const playbackRunId = useRef(0);
  const playbackTimeline = useMemo(() => buildPlaybackTimeline(score), [score]);

  function clearPlaybackAnimationFrame() {
    if (playbackAnimationFrame.current !== null) {
      window.cancelAnimationFrame(playbackAnimationFrame.current);
      playbackAnimationFrame.current = null;
    }
  }

  function stopPlayback(message = 'Playback stopped') {
    playbackRunId.current += 1;
    playbackController.current?.stop();
    playbackController.current = null;
    clearPlaybackAnimationFrame();

    setIsPlaying(false);
    setIsPaused(false);
    setPlaybackElapsedSeconds(0);
    setPlaybackStartOffsetSeconds(0);
    setEditorMessage(message);
  }

  function pausePlayback(message = 'Playback paused') {
    if (!isPlaying) {
      return;
    }

    playbackRunId.current += 1;
    const pausedAtSeconds = Math.max(
      0,
      playbackStartOffsetSeconds +
        Math.max(0, getControllerElapsedSeconds(playbackController.current)),
    );

    playbackController.current?.stop();
    playbackController.current = null;
    clearPlaybackAnimationFrame();

    setIsPlaying(false);
    setIsPaused(true);
    setPlaybackElapsedSeconds(0);
    setPlaybackStartOffsetSeconds(pausedAtSeconds);
    setEditorMessage(message);
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
    setIsPaused(false);
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
    setEditorMessage(
      controller.audioStarted === false
        ? 'Playback cursor started; browser audio is not available'
        : messages.started,
    );
    const updatePlaybackClock = () => {
      if (playbackRunId.current !== runId) {
        return;
      }

      const nextElapsedSeconds =
        controller.getElapsedSeconds?.() ??
        (performance.now() - controller.startedAtMs) / 1000;

      if (nextElapsedSeconds >= remainingDurationSeconds) {
        playbackController.current?.stop();
        playbackController.current = null;
        clearPlaybackAnimationFrame();
        setIsPlaying(false);
        setIsPaused(false);
        setPlaybackElapsedSeconds(0);
        setPlaybackStartOffsetSeconds(0);
        setEditorMessage('Playback finished');
        return;
      }

      setPlaybackElapsedSeconds(nextElapsedSeconds);
      playbackAnimationFrame.current =
        window.requestAnimationFrame(updatePlaybackClock);
    };
    updatePlaybackClock();
  }

  async function handlePlaybackToggle() {
    if (isPlaying) {
      pausePlayback();
      return;
    }

    if (isPaused) {
      await warmUpPlaybackAudio();
      await startPlayback(playbackTimeline, playbackStartOffsetSeconds, {
        started: 'Playback resumed',
        starting: 'Playback resuming',
      });
      return;
    }

    await warmUpPlaybackAudio();
    const timeline = playbackTimeline;

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
    if (isPlaying || isPaused) {
      stopPlayback();
      return;
    }

    await warmUpPlaybackAudio();
    const timeline = playbackTimeline;

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

  const isPlaybackActive = isPlaying || isPaused;
  const isPlaybackClockStarted = isPaused || playbackElapsedSeconds >= 0;
  const playbackClockSeconds = isPaused
    ? playbackStartOffsetSeconds
    : isPlaybackClockStarted
    ? playbackStartOffsetSeconds + playbackElapsedSeconds
    : playbackElapsedSeconds;
  const activePlaybackEvents = isPlaybackActive && isPlaybackClockStarted
    ? getActiveTimelineEvents(playbackTimeline, playbackClockSeconds)
    : [];
  const activePlaybackEvent = activePlaybackEvents[0] ?? null;
  const playbackBeat = isPlaybackActive && isPlaybackClockStarted
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
    handlePlaybackStop: stopPlayback,
    handlePlaybackToggle,
    isPlaybackPaused: isPaused,
    isPlaying,
    playbackBeat,
  };
}
