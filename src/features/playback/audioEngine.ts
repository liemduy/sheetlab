import type { PlaybackTimelineEvent } from './timeline';
import { pitchToToneNote } from './pitch';

export interface PlaybackController {
  stop: () => void;
}

export async function playTimelineAudio(
  timeline: PlaybackTimelineEvent[],
): Promise<PlaybackController> {
  type AudioGlobal = typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextConstructor =
    globalThis.AudioContext ?? (globalThis as AudioGlobal).webkitAudioContext;

  if (!AudioContextConstructor) {
    return {
      stop: () => undefined,
    };
  }

  const Tone = await import('tone');
  await Tone.start();
  const synth = new Tone.PolySynth(Tone.Synth).toDestination();
  const now = Tone.now();

  timeline.forEach((event) => {
    if (event.pitches.length > 0) {
      synth.triggerAttackRelease(
        event.pitches.map(pitchToToneNote),
        event.durationSeconds,
        now + event.startSeconds,
      );
    }
  });

  return {
    stop: () => {
      synth.releaseAll();
      synth.dispose();
    },
  };
}
