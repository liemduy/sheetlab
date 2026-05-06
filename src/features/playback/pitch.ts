import type { Pitch } from '../../domain/score/types';

const SEMITONE_BY_STEP = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
} satisfies Record<Pitch['step'], number>;

export function pitchToMidi(pitch: Pitch) {
  const accidentalOffset =
    pitch.accidental === 'sharp' ? 1 : pitch.accidental === 'flat' ? -1 : 0;

  return (pitch.octave + 1) * 12 + SEMITONE_BY_STEP[pitch.step] + accidentalOffset;
}

export function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function pitchToToneNote(pitch: Pitch) {
  const accidental =
    pitch.accidental === 'sharp' ? '#' : pitch.accidental === 'flat' ? 'b' : '';

  return `${pitch.step}${accidental}${pitch.octave}`;
}
