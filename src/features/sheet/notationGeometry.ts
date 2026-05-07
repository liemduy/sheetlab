import type { Clef, Pitch } from '../../domain/score/types';
import {
  STAFF_GAP,
  STAFF_LINE_SPACING,
  getMeasureContentLeft,
  getMeasureContentWidth,
  getStaffTop,
} from './layout';

const NOTE_STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const TOP_LINE_BY_CLEF = {
  treble: { step: 'F', octave: 5 },
  bass: { step: 'A', octave: 3 },
} satisfies Record<Clef, Pitch>;

function pitchToDiatonicValue(pitch: Pitch) {
  return pitch.octave * NOTE_STEPS.length + NOTE_STEPS.indexOf(pitch.step);
}

export function getPitchY(
  pitch: Pitch,
  clef: Clef,
  staffIndex: number,
  staffGap = STAFF_GAP,
) {
  const topLineValue = pitchToDiatonicValue(TOP_LINE_BY_CLEF[clef]);
  const pitchValue = pitchToDiatonicValue(pitch);
  const diatonicOffset = pitchValue - topLineValue;

  return getStaffTop(staffIndex, staffGap) - diatonicOffset * (STAFF_LINE_SPACING / 2);
}

export function getBeatX(
  measureIndex: number,
  beat: number,
  beatsPerMeasure: number,
) {
  return (
    getMeasureContentLeft(measureIndex) +
    (beat / beatsPerMeasure) * getMeasureContentWidth(measureIndex)
  );
}
