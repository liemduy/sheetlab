import type { Clef, Pitch } from './types';

export const NOTE_STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export const STAFF_LEDGER_LINE_LIMIT = 3;

export const TOP_LINE_BY_CLEF = {
  treble: { step: 'F', octave: 5 },
  bass: { step: 'A', octave: 3 },
} satisfies Record<Clef, Pitch>;

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
  const topLineValue = pitchToDiatonicValue(TOP_LINE_BY_CLEF[clef]);
  const bottomLineValue = topLineValue - 8;
  const ledgerRange = STAFF_LEDGER_LINE_LIMIT * 2;

  return {
    max: diatonicValueToPitch(topLineValue + ledgerRange),
    min: diatonicValueToPitch(bottomLineValue - ledgerRange),
  };
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

