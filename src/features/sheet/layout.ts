import type { Clef, Pitch, Score, ScoreType } from '../../domain/score/types';
import { getEventPitches } from '../../domain/score/events';
import {
  TOP_LINE_BY_CLEF,
  clampPitchToClefRange,
  pitchToDiatonicValue,
} from '../../domain/score/pitchRange';

export const STAFF_LEFT = 76;
export const STAFF_RIGHT = 884;
export const STAFF_LINE_SPACING = 11;
export const STAFF_GAP = 132;
export const MEASURE_WIDTH = 202;
export const MEASURES_PER_SYSTEM = 4;
export const MEASURE_LEFT_PADDING = 20;
export const FIRST_MEASURE_LEFT_PADDING = 78;
export const MEASURE_RIGHT_PADDING = 20;
export const FIRST_STAFF_Y = 118;
export const SVG_WIDTH = 920;
export const VEXFLOW_STAVE_TOP_LINE_OFFSET = 44.5;

const STAFF_DYNAMIC_PADDING = 28;
const TREBLE_SYSTEM_GAP = 170;
const GRAND_SYSTEM_PADDING = 152;

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
    getPitchYRelativeToStaffTop(
      clampPitchToClefRange(pitch, staff.clef),
      staff.clef,
    ),
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

function getScoreMeasureCount(score: Score | ScoreType) {
  if (typeof score === 'string') {
    return MEASURES_PER_SYSTEM;
  }

  return Math.max(
    MEASURES_PER_SYSTEM,
    ...score.parts.flatMap((part) =>
      part.staves.map((staff) => staff.measures.length),
    ),
  );
}

export function getSystemIndex(measureIndex: number) {
  return Math.floor(Math.max(0, measureIndex) / MEASURES_PER_SYSTEM);
}

export function getLocalMeasureIndex(measureIndex: number) {
  return Math.max(0, measureIndex) % MEASURES_PER_SYSTEM;
}

export function getScoreSystemGap(score: Score | ScoreType) {
  const scoreType = typeof score === 'string' ? score : score.type;

  return scoreType === 'grand'
    ? getScoreStaffGap(score) + GRAND_SYSTEM_PADDING
    : TREBLE_SYSTEM_GAP;
}

export function getSystemFirstMeasureIndex(measureIndex: number) {
  return getSystemIndex(measureIndex) * MEASURES_PER_SYSTEM;
}

export function getMeasureCountForSystem(
  measureCount: number,
  systemIndex: number,
) {
  const remainingMeasures = measureCount - systemIndex * MEASURES_PER_SYSTEM;

  return Math.max(0, Math.min(MEASURES_PER_SYSTEM, remainingMeasures));
}

export function getStaffTop(
  staffIndex: number,
  staffGap = STAFF_GAP,
  measureIndex = 0,
  systemGap = staffGap + GRAND_SYSTEM_PADDING,
) {
  return FIRST_STAFF_Y + getSystemIndex(measureIndex) * systemGap + staffIndex * staffGap;
}

export function getMeasureX(measureIndex: number) {
  return STAFF_LEFT + getLocalMeasureIndex(measureIndex) * MEASURE_WIDTH;
}

export function getMeasureRight(measureIndex: number) {
  return getMeasureX(measureIndex) + MEASURE_WIDTH;
}

export function getMeasureContentLeft(measureIndex: number) {
  return (
    getMeasureX(measureIndex) +
    (getLocalMeasureIndex(measureIndex) === 0
      ? FIRST_MEASURE_LEFT_PADDING
      : MEASURE_LEFT_PADDING)
  );
}

export function getMeasureContentRight(measureIndex: number) {
  return getMeasureRight(measureIndex) - MEASURE_RIGHT_PADDING;
}

export function getMeasureContentWidth(measureIndex: number) {
  return getMeasureContentRight(measureIndex) - getMeasureContentLeft(measureIndex);
}

export function getStaffRight(measureCount: number, measureIndex = 0) {
  return (
    STAFF_LEFT +
    getMeasureCountForSystem(
      measureCount,
      getSystemIndex(measureIndex),
    ) *
      MEASURE_WIDTH
  );
}

export function getScoreSvgHeight(score: Score | ScoreType) {
  const scoreType = typeof score === 'string' ? score : score.type;
  const staffGap = getScoreStaffGap(score);
  const systemGap = getScoreSystemGap(score);
  const measureCount = getScoreMeasureCount(score);
  const systemCount = Math.max(1, Math.ceil(measureCount / MEASURES_PER_SYSTEM));
  const lastMeasureIndex = (systemCount - 1) * MEASURES_PER_SYSTEM;

  if (scoreType === 'grand') {
    const lastStaffBottom =
      getStaffTop(1, staffGap, lastMeasureIndex, systemGap) +
      STAFF_LINE_SPACING * 4;

    return Math.max(420, lastStaffBottom + 128);
  }

  return Math.max(
    280,
    getStaffTop(0, staffGap, lastMeasureIndex, systemGap) +
      STAFF_LINE_SPACING * 4 +
      110,
  );
}
