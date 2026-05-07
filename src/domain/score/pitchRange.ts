import type { Clef, Pitch } from './types';

export const NOTE_STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

export const TOP_LINE_BY_CLEF = {
  treble: { step: 'F', octave: 5 },
  bass: { step: 'A', octave: 3 },
} satisfies Record<Clef, Pitch>;

const CLEF_PITCH_RANGE = {
  // These are editor safety rails, not a ledger-line drawing limit. Notes
  // outside this range should normally move to another staff or use 8va later.
  treble: {
    max: { step: 'C', octave: 7 },
    min: { step: 'C', octave: 3 },
  },
  bass: {
    max: { step: 'C', octave: 5 },
    min: { step: 'A', octave: 0 },
  },
} satisfies Record<Clef, { min: Pitch; max: Pitch }>;

export function pitchToDiatonicValue(pitch: Pitch) {
  return pitch.octave * NOTE_STEPS.length + NOTE_STEPS.indexOf(pitch.step);
}

export function diatonicValueToPitch(value: number): Pitch {
  const stepCount = NOTE_STEPS.length;
  const stepIndex = ((value % stepCount) + stepCount) % stepCount;
  const octave = Math.floor((value - stepIndex) / stepCount);

  return {
    step: NOTE_STEPS[stepIndex],
    octave,
  };
}

export function getClefPitchRange(clef: Clef) {
  return CLEF_PITCH_RANGE[clef];
}

export function clampPitchToClefRange(pitch: Pitch, clef: Clef): Pitch {
  const { max, min } = getClefPitchRange(clef);
  const value = pitchToDiatonicValue(pitch);
  const minValue = pitchToDiatonicValue(min);
  const maxValue = pitchToDiatonicValue(max);

  if (value < minValue) {
    return min;
  }

  if (value > maxValue) {
    return max;
  }

  return pitch;
}
