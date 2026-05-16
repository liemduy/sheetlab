import type { PlaybackTimelineEvent } from './timeline';
import { pitchToToneNote } from './pitch';
import type { Pitch } from '../../domain/score/types';

export interface PlaybackController {
  startedAtMs: number;
  stop: () => void;
}

export interface PlaybackAudioOptions {
  startSeconds?: number;
}

const PLAYBACK_SCHEDULE_LEAD_SECONDS = 0.08;

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

export async function playTimelineAudio(
  timeline: PlaybackTimelineEvent[],
  options: PlaybackAudioOptions = {},
): Promise<PlaybackController> {
  type AudioGlobal = typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextConstructor =
    globalThis.AudioContext ?? (globalThis as AudioGlobal).webkitAudioContext;

  if (!AudioContextConstructor) {
    return {
      startedAtMs: performance.now(),
      stop: () => undefined,
    };
  }

  const Tone = await import('tone');
  await Tone.start();
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
  const startedAtMs =
    performance.now() +
    (toneLookAheadSeconds +
      PLAYBACK_SCHEDULE_LEAD_SECONDS +
      outputLatencySeconds) *
      1000;

  timeline.forEach((event) => {
    if (event.pitches.length > 0 && event.startSeconds >= startSeconds) {
      synth.triggerAttackRelease(
        event.pitches.map(pitchToToneNote),
        event.soundDurationSeconds,
        scheduledStartSeconds + event.startSeconds - startSeconds,
        event.velocity,
      );
    }
  });

  return {
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
  type AudioGlobal = typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextConstructor =
    globalThis.AudioContext ?? (globalThis as AudioGlobal).webkitAudioContext;

  if (!AudioContextConstructor || pitches.length === 0) {
    return;
  }

  const Tone = await import('tone');
  await Tone.start();
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
