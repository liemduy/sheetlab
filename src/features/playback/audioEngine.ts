import type { PlaybackTimelineEvent } from './timeline';
import { pitchToToneNote } from './pitch';
import type { Pitch } from '../../domain/score/types';

export interface PlaybackController {
  audioStarted?: boolean;
  getElapsedSeconds?: () => number;
  startedAtMs: number;
  stop: () => void;
}

export interface PlaybackAudioOptions {
  startSeconds?: number;
}

const PLAYBACK_SCHEDULE_LEAD_SECONDS = 0.08;
let toneImportPromise: Promise<typeof import('tone')> | null = null;

function getAudioContextConstructor() {
  type AudioGlobal = typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

  return globalThis.AudioContext ?? (globalThis as AudioGlobal).webkitAudioContext;
}

async function getToneModule() {
  toneImportPromise ??= import('tone');

  return toneImportPromise;
}

function getAudioOutputLatencySeconds(Tone: typeof import('tone')) {
  const rawContext = Tone.getContext().rawContext as AudioContext & {
    outputLatency?: number;
  };
  const outputLatency =
    typeof rawContext.outputLatency === 'number' ? rawContext.outputLatency : 0;
  const baseLatency =
    typeof rawContext.baseLatency === 'number' ? rawContext.baseLatency : 0;

  return Math.max(outputLatency, baseLatency, 0);
}

export async function warmUpPlaybackAudio() {
  if (!getAudioContextConstructor()) {
    return false;
  }

  const Tone = await getToneModule();
  await Tone.start();

  return Tone.getContext().state === 'running';
}

export async function playTimelineAudio(
  timeline: PlaybackTimelineEvent[],
  options: PlaybackAudioOptions = {},
): Promise<PlaybackController> {
  if (!getAudioContextConstructor()) {
    const performanceStartedAtMs = performance.now();

    return {
      audioStarted: false,
      getElapsedSeconds: () => (performance.now() - performanceStartedAtMs) / 1000,
      startedAtMs: performanceStartedAtMs,
      stop: () => undefined,
    };
  }

  const Tone = await getToneModule();
  const audioStarted = await warmUpPlaybackAudio();
  const synth = new Tone.PolySynth(Tone.Synth).toDestination();
  const audioNowSeconds = Tone.now();
  const audioImmediateSeconds = Tone.immediate();
  const toneLookAheadSeconds = Math.max(
    0,
    audioNowSeconds - audioImmediateSeconds,
  );
  const outputLatencySeconds = getAudioOutputLatencySeconds(Tone);
  const scheduledStartSeconds =
    audioNowSeconds + PLAYBACK_SCHEDULE_LEAD_SECONDS;
  const startSeconds = Math.max(0, options.startSeconds ?? 0);
  const playbackStartAudioSeconds =
    scheduledStartSeconds + outputLatencySeconds;
  const startedAtMs =
    performance.now() +
    Math.max(
      0,
      playbackStartAudioSeconds - audioImmediateSeconds,
      toneLookAheadSeconds +
        PLAYBACK_SCHEDULE_LEAD_SECONDS +
        outputLatencySeconds,
    ) *
      1000;

  if (audioStarted) {
    timeline.forEach((event) => {
      if (event.pitches.length === 0 || event.startSeconds < startSeconds) {
        return;
      }

      synth.triggerAttackRelease(
        event.pitches.map(pitchToToneNote),
        event.soundDurationSeconds,
        scheduledStartSeconds + event.startSeconds - startSeconds,
        event.velocity,
      );
    });
  }

  return {
    audioStarted,
    getElapsedSeconds: () =>
      Tone.immediate() - playbackStartAudioSeconds,
    startedAtMs,
    stop: () => {
      synth.releaseAll();
      synth.dispose();
    },
  };
}

export async function playPitchPreview(
  pitches: Pitch[],
  durationSeconds = 0.24,
): Promise<void> {
  if (!getAudioContextConstructor() || pitches.length === 0) {
    return;
  }

  const Tone = await getToneModule();
  const audioStarted = await warmUpPlaybackAudio();

  if (!audioStarted) {
    return;
  }

  const synth = new Tone.PolySynth(Tone.Synth).toDestination();

  synth.triggerAttackRelease(
    pitches.map(pitchToToneNote),
    durationSeconds,
    Tone.now(),
  );
  globalThis.setTimeout(() => {
    synth.releaseAll();
    synth.dispose();
  }, (durationSeconds + 0.18) * 1000);
}
