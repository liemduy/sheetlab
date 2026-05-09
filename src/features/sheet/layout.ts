import type { Clef, Pitch, Score, ScoreType } from '../../domain/score/types';
import { getDurationBeats } from '../../domain/score/durations';
import {
  getEventDots,
  getEventPitches,
  isGeneratedRestEvent,
} from '../../domain/score/events';
import {
  TOP_LINE_BY_CLEF,
  clampPitchToClefRange,
  pitchToDiatonicValue,
} from '../../domain/score/pitchRange';
import { getMeasureBeats } from '../../domain/score/timeSignatures';

export const STAFF_LEFT = 36;
export const STAFF_RIGHT = 884;
export const STAFF_LINE_SPACING = 11;
export const STAFF_GAP = 132;
export const MEASURE_WIDTH = 212;
export const MEASURES_PER_SYSTEM = 4;
export const MEASURE_LEFT_PADDING = 20;
export const FIRST_MEASURE_LEFT_PADDING = 78;
export const MEASURE_RIGHT_PADDING = 20;
export const FIRST_STAFF_Y = 118;
export const SVG_WIDTH = 920;
export const SYSTEM_WIDTH = STAFF_RIGHT - STAFF_LEFT;
export const VEXFLOW_STAVE_TOP_LINE_OFFSET = 44.5;

const STAFF_DYNAMIC_PADDING = 28;
const TREBLE_SYSTEM_GAP = 170;
const GRAND_SYSTEM_PADDING = 152;
const ANNOTATION_ROW_GAP = 26;
const BELOW_STAFF_ANNOTATION_BASELINE = STAFF_LINE_SPACING * 4 + 30;
const BELOW_STAFF_ANNOTATION_DESCENT = 5;
const BELOW_STAFF_ANNOTATION_INK_GAP = 10;
const BELOW_STAFF_ANNOTATION_TEXT_HEIGHT = 18;
const BELOW_STAFF_NOTE_INK_ESTIMATE = 80;
const ABOVE_STAFF_ANNOTATION_DESCENT = 5;
const ABOVE_STAFF_ANNOTATION_GAP = 10;
const ABOVE_STAFF_CHORD_SYMBOL_HEIGHT = 20;
const ABOVE_STAFF_FERMATA_HEIGHT = 26;

type ScoreMeasure = Score['parts'][number]['staves'][number]['measures'][number];
type PitchBounds = { maxY: number; minY: number };

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

function getMeasureBelowAnnotationRow(measure: ScoreMeasure) {
  const rowCounts = new Map<number, number>();
  let maxBaseRow = -1;

  measure.voices.forEach((voice) => {
    voice.events.forEach((event) => {
      if (isGeneratedRestEvent(event)) {
        return;
      }

      const rows = [
        event.lyric ? 0 : null,
        event.dynamic ? 1 : null,
        event.pedal ? 2 : null,
      ].filter((row): row is number => row !== null);

      rows.forEach((row) => {
        maxBaseRow = Math.max(maxBaseRow, row);
        rowCounts.set(row, (rowCounts.get(row) ?? 0) + 1);
      });
    });
  });

  if (maxBaseRow < 0) {
    return -1;
  }

  const collisionRows = Math.max(
    0,
    ...[...rowCounts.values()].map((count) => count - 1),
  );

  return maxBaseRow + collisionRows;
}

function getStaffBelowAnnotationRow(score: Score, staffIndex: number) {
  const staff = score.parts[0]?.staves[staffIndex];

  return Math.max(
    -1,
    ...(staff?.measures.map(getMeasureBelowAnnotationRow) ?? []),
  );
}

function getMeasureAboveAnnotationRow(measure: ScoreMeasure) {
  let annotationCount = 0;

  measure.voices.forEach((voice) => {
    voice.events.forEach((event) => {
      if (isGeneratedRestEvent(event)) {
        return;
      }

      if (event.chordSymbol) {
        annotationCount += 1;
      }

      if (event.fermata) {
        annotationCount += 1;
      }
    });
  });

  return annotationCount > 0 ? annotationCount - 1 : -1;
}

function getStaffAboveAnnotationRow(score: Score, staffIndex: number) {
  const staff = score.parts[0]?.staves[staffIndex];

  return Math.max(
    -1,
    ...(staff?.measures.map(getMeasureAboveAnnotationRow) ?? []),
  );
}

function getStaffBelowAnnotationBottomExtent(
  score: Score,
  staffIndex: number,
  pitchBounds: PitchBounds,
) {
  const maxAnnotationRow = getStaffBelowAnnotationRow(score, staffIndex);

  if (maxAnnotationRow < 0) {
    return pitchBounds.maxY;
  }

  const estimatedInkBottom = Math.max(
    STAFF_LINE_SPACING * 4,
    pitchBounds.maxY + BELOW_STAFF_NOTE_INK_ESTIMATE,
  );
  const baseline = Math.max(
    BELOW_STAFF_ANNOTATION_BASELINE,
    estimatedInkBottom +
      BELOW_STAFF_ANNOTATION_INK_GAP +
      BELOW_STAFF_ANNOTATION_TEXT_HEIGHT,
  );

  return (
    baseline +
    maxAnnotationRow * ANNOTATION_ROW_GAP +
    BELOW_STAFF_ANNOTATION_DESCENT
  );
}

function getStaffAboveAnnotationExtent(
  score: Score,
  staffIndex: number,
  pitchBounds: PitchBounds,
) {
  const maxAnnotationRow = getStaffAboveAnnotationRow(score, staffIndex);

  if (maxAnnotationRow < 0) {
    return Math.max(0, -pitchBounds.minY);
  }

  const chordSymbolTop =
    Math.min(
      -18,
      pitchBounds.minY -
        ABOVE_STAFF_ANNOTATION_GAP -
        ABOVE_STAFF_ANNOTATION_DESCENT,
    ) - ABOVE_STAFF_CHORD_SYMBOL_HEIGHT;
  const fermataTop =
    Math.min(-30, pitchBounds.minY - 18) - ABOVE_STAFF_FERMATA_HEIGHT;
  const annotationTop =
    Math.min(chordSymbolTop, fermataTop) - maxAnnotationRow * ANNOTATION_ROW_GAP;

  return Math.max(0, -pitchBounds.minY, -annotationTop);
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
  const pitchDrivenGap =
    extraGap === 0 ? STAFF_GAP : STAFF_GAP + extraGap + STAFF_DYNAMIC_PADDING;
  const trebleBottomExtent = Math.max(
    STAFF_LINE_SPACING * 4,
    trebleBounds.maxY,
    getStaffBelowAnnotationBottomExtent(score, 0, trebleBounds),
  );
  const bassAboveExtent = Math.max(
    bassAboveStaff,
    getStaffAboveAnnotationExtent(score, 1, bassBounds),
  );
  const annotationDrivenGap =
    trebleBottomExtent + bassAboveExtent + STAFF_DYNAMIC_PADDING;

  return Math.max(STAFF_GAP, pitchDrivenGap, annotationDrivenGap);
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

function normalizeBoundary(beat: number, beatsPerMeasure: number) {
  return Number(Math.min(beatsPerMeasure, Math.max(0, beat)).toFixed(4));
}

function countMeasureRhythmIntervals(score: Score, measureIndex: number) {
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const boundaries = new Set<number>([
    0,
    beatsPerMeasure,
  ]);

  for (let beat = 1; beat < beatsPerMeasure; beat += 1) {
    boundaries.add(normalizeBoundary(beat, beatsPerMeasure));
  }

  score.parts
    .flatMap((part) => part.staves)
    .forEach((staff) => {
      const measure = staff.measures.find(
        (candidate) => candidate.index === measureIndex,
      );

      measure?.voices.forEach((voice) => {
        voice.events.forEach((event) => {
          if (isGeneratedRestEvent(event)) {
            return;
          }

          const eventStart = normalizeBoundary(event.beat, beatsPerMeasure);
          const eventEnd = normalizeBoundary(
            event.beat + getDurationBeats(event.duration, getEventDots(event)),
            beatsPerMeasure,
          );

          boundaries.add(eventStart);
          boundaries.add(eventEnd);
        });
      });
    });

  const sortedBoundaries = [...boundaries].sort((a, b) => a - b);

  return sortedBoundaries.reduce((intervalCount, boundary, index) => {
    const nextBoundary = sortedBoundaries[index + 1];

    return nextBoundary !== undefined && nextBoundary - boundary > 0.0001
      ? intervalCount + 1
      : intervalCount;
  }, 0);
}

export function getMeasureSlotWeight(score: Score, measureIndex: number) {
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);

  return Math.max(
    beatsPerMeasure,
    countMeasureRhythmIntervals(score, measureIndex),
  );
}

function getSystemMeasureIndexes(score: Score, systemIndex: number) {
  const measureCount = getScoreMeasureCount(score);
  const measureCountForSystem = getMeasureCountForSystem(measureCount, systemIndex);
  const firstMeasureIndex = systemIndex * MEASURES_PER_SYSTEM;

  return Array.from(
    { length: measureCountForSystem },
    (_, offset) => firstMeasureIndex + offset,
  );
}

export function getMeasureWidth(measureIndex: number, score?: Score) {
  if (!score) {
    return MEASURE_WIDTH;
  }

  const systemMeasureIndexes = getSystemMeasureIndexes(
    score,
    getSystemIndex(measureIndex),
  );

  if (systemMeasureIndexes.length === 0) {
    return MEASURE_WIDTH;
  }

  const weights = systemMeasureIndexes.map((index) =>
    getMeasureSlotWeight(score, index),
  );
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  const measureOffset = systemMeasureIndexes.indexOf(measureIndex);
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const measureWeight =
    measureOffset >= 0 ? weights[measureOffset] ?? beatsPerMeasure : beatsPerMeasure;

  return (SYSTEM_WIDTH * measureWeight) / Math.max(1, totalWeight);
}

export function getMeasureX(measureIndex: number, score?: Score) {
  if (!score) {
    return STAFF_LEFT + getLocalMeasureIndex(measureIndex) * MEASURE_WIDTH;
  }

  const firstMeasureIndex = getSystemFirstMeasureIndex(measureIndex);
  let x = STAFF_LEFT;

  for (let index = firstMeasureIndex; index < measureIndex; index += 1) {
    x += getMeasureWidth(index, score);
  }

  return x;
}

export function getMeasureRight(measureIndex: number, score?: Score) {
  return getMeasureX(measureIndex, score) + getMeasureWidth(measureIndex, score);
}

function getMeasureLeftPadding(measureIndex: number, score?: Score) {
  const desiredPadding =
    getLocalMeasureIndex(measureIndex) === 0
      ? FIRST_MEASURE_LEFT_PADDING
      : MEASURE_LEFT_PADDING;

  if (!score) {
    return desiredPadding;
  }

  const measureWidth = getMeasureWidth(measureIndex, score);
  const maxPadding = Math.max(
    MEASURE_LEFT_PADDING,
    measureWidth - MEASURE_RIGHT_PADDING - 24,
  );

  return Math.min(desiredPadding, maxPadding);
}

export function getMeasureContentLeft(measureIndex: number, score?: Score) {
  return getMeasureX(measureIndex, score) + getMeasureLeftPadding(measureIndex, score);
}

export function getMeasureContentRight(measureIndex: number, score?: Score) {
  return getMeasureRight(measureIndex, score) - MEASURE_RIGHT_PADDING;
}

export function getMeasureContentWidth(measureIndex: number, score?: Score) {
  return getMeasureContentRight(measureIndex, score) - getMeasureContentLeft(measureIndex, score);
}

export function getStaffRight(
  measureCount: number,
  measureIndex = 0,
  score?: Score,
) {
  if (!score) {
    return (
      STAFF_LEFT +
      getMeasureCountForSystem(
        measureCount,
        getSystemIndex(measureIndex),
      ) *
        MEASURE_WIDTH
    );
  }

  const systemIndex = getSystemIndex(measureIndex);
  const measureCountForSystem = getMeasureCountForSystem(measureCount, systemIndex);

  if (measureCountForSystem <= 0) {
    return STAFF_LEFT;
  }

  const lastMeasureIndex =
    systemIndex * MEASURES_PER_SYSTEM + measureCountForSystem - 1;

  return getMeasureRight(lastMeasureIndex, score);
}

export function getStaticMeasureX(measureIndex: number) {
  return STAFF_LEFT + getLocalMeasureIndex(measureIndex) * MEASURE_WIDTH;
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
