import type { Clef, Pitch, Score, ScoreType } from '../../domain/score/types';
import { getEventPitches } from '../../domain/score/events';

export const STAFF_LEFT = 76;
export const STAFF_RIGHT = 884;
export const STAFF_LINE_SPACING = 11;
export const STAFF_GAP = 132;
export const MEASURE_WIDTH = 202;
export const MEASURE_LEFT_PADDING = 20;
export const FIRST_MEASURE_LEFT_PADDING = 78;
export const MEASURE_RIGHT_PADDING = 20;
export const FIRST_STAFF_Y = 118;
export const SVG_WIDTH = 920;
export const VEXFLOW_STAVE_TOP_LINE_OFFSET = 44.5;

const NOTE_STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const TOP_LINE_BY_CLEF = {
  treble: { step: 'F', octave: 5 },
  bass: { step: 'A', octave: 3 },
} satisfies Record<Clef, Pitch>;
const STAFF_DYNAMIC_PADDING = 28;

function pitchToDiatonicValue(pitch: Pitch) {
  return pitch.octave * NOTE_STEPS.length + NOTE_STEPS.indexOf(pitch.step);
}

function getPitchYRelativeToStaffTop(pitch: Pitch, clef: Clef) {
  const topLineValue = pitchToDiatonicValue(TOP_LINE_BY_CLEF[clef]);
  const pitchValue = pitchToDiatonicValue(pitch);
  const diatonicOffset = pitchValue - topLineValue;

  return -diatonicOffset * (STAFF_LINE_SPACING / 2);
}

function getStaffPitchBounds(score: Score, staffIndex: number) {
  const staff = score.parts[0]?.staves[staffIndex];
  const eventPitches =
    staff?.measures.flatMap((measure) =>
      measure.voices.flatMap((voice) =>
        voice.events.flatMap((event) => getEventPitches(event)),
      ),
    ) ?? [];

  if (!staff || eventPitches.length === 0) {
    return {
      maxY: STAFF_LINE_SPACING * 4,
      minY: 0,
    };
  }

  const pitchYs = eventPitches.map((pitch) =>
    getPitchYRelativeToStaffTop(pitch, staff.clef),
  );

  return {
    maxY: Math.max(STAFF_LINE_SPACING * 4, ...pitchYs),
    minY: Math.min(0, ...pitchYs),
  };
}

export function getScoreStaffGap(score: Score | ScoreType) {
  if (score === 'treble' || score === 'grand') {
    return STAFF_GAP;
  }

  if (score.type !== 'grand') {
    return STAFF_GAP;
  }

  const trebleBounds = getStaffPitchBounds(score, 0);
  const bassBounds = getStaffPitchBounds(score, 1);
  const trebleBelowStaff = Math.max(0, trebleBounds.maxY - STAFF_LINE_SPACING * 4);
  const bassAboveStaff = Math.max(0, -bassBounds.minY);
  const extraGap = trebleBelowStaff + bassAboveStaff;

  if (extraGap === 0) {
    return STAFF_GAP;
  }

  return Math.max(
    STAFF_GAP,
    STAFF_GAP + extraGap + STAFF_DYNAMIC_PADDING,
  );
}

export function getStaffTop(staffIndex: number, staffGap = STAFF_GAP) {
  return FIRST_STAFF_Y + staffIndex * staffGap;
}

export function getMeasureX(measureIndex: number) {
  return STAFF_LEFT + measureIndex * MEASURE_WIDTH;
}

export function getMeasureRight(measureIndex: number) {
  return getMeasureX(measureIndex) + MEASURE_WIDTH;
}

export function getMeasureContentLeft(measureIndex: number) {
  return (
    getMeasureX(measureIndex) +
    (measureIndex === 0 ? FIRST_MEASURE_LEFT_PADDING : MEASURE_LEFT_PADDING)
  );
}

export function getMeasureContentRight(measureIndex: number) {
  return getMeasureRight(measureIndex) - MEASURE_RIGHT_PADDING;
}

export function getMeasureContentWidth(measureIndex: number) {
  return getMeasureContentRight(measureIndex) - getMeasureContentLeft(measureIndex);
}

export function getStaffRight(measureCount: number) {
  return STAFF_LEFT + measureCount * MEASURE_WIDTH;
}

export function getScoreSvgHeight(score: Score | ScoreType) {
  const scoreType = typeof score === 'string' ? score : score.type;
  const staffGap = getScoreStaffGap(score);

  if (scoreType === 'grand') {
    return Math.max(420, 420 + staffGap - STAFF_GAP);
  }

  return 280;
}
