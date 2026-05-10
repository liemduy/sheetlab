import { snapBeatToInputSlot } from '../../domain/score/inputGrid';
import type {
  DurationValue,
  Pitch,
  Score,
  Staff,
  StaffId,
} from '../../domain/score/types';
import {
  TOP_LINE_BY_CLEF,
  clampPitchToClefRange,
  diatonicValueToPitch,
  pitchToDiatonicValue,
} from '../../domain/score/pitchRange';
import {
  STAFF_LEFT,
  STAFF_GAP,
  STAFF_LINE_SPACING,
  getMeasureContentLeft,
  getMeasureContentWidth,
  getMeasureRight,
  getScoreSystemCount,
  getScoreSystemMeasureIndexes,
  getScoreStaffTop,
  getStaffRight,
  getStaffTop,
} from './layout';
import { getMeasureBeats } from '../../domain/score/timeSignatures';

export interface SvgPoint {
  x: number;
  y: number;
}

export interface MusicPosition {
  clientX?: number;
  clientY?: number;
  staffId: StaffId;
  staffIndex: number;
  measureIndex: number;
  beat: number;
  pitch: Pitch;
  x: number;
  y: number;
}

const STAFF_VERTICAL_PADDING = 74;
const GRAND_STAFF_DEAD_ZONE_HEIGHT = 4;
const GRAND_STAFF_TOP_INNER_PADDING = 18;
const GRAND_STAFF_BOTTOM_INNER_PADDING = 40;
const GRAND_STAFF_CORE_SWITCH_PADDING = 8;

interface MusicPositionOptions {
  dots?: number;
  duration?: DurationValue;
  preferredStaffId?: StaffId | null;
}

export function mapStaffYToPitch(
  y: number,
  clef: Staff['clef'],
  staffIndex: number,
  staffGap = STAFF_GAP,
  measureIndex = 0,
  systemGap = staffGap + 152,
) {
  const staffTop = getStaffTop(staffIndex, staffGap, measureIndex, systemGap);
  const diatonicOffset = Math.round(
    (staffTop - y) / (STAFF_LINE_SPACING / 2),
  );

  const pitch = diatonicValueToPitch(
    pitchToDiatonicValue(TOP_LINE_BY_CLEF[clef]) + diatonicOffset,
  );

  return clampPitchToClefRange(pitch, clef);
}

export function mapScoreStaffYToPitch(
  y: number,
  clef: Staff['clef'],
  staffIndex: number,
  score: Score,
  measureIndex = 0,
) {
  const staffTop = getScoreStaffTop(score, staffIndex, measureIndex);
  const diatonicOffset = Math.round(
    (staffTop - y) / (STAFF_LINE_SPACING / 2),
  );

  const pitch = diatonicValueToPitch(
    pitchToDiatonicValue(TOP_LINE_BY_CLEF[clef]) + diatonicOffset,
  );

  return clampPitchToClefRange(pitch, clef);
}

export function formatPitch(pitch: Pitch) {
  const accidental = pitch.accidental
    ? { flat: 'b', natural: '', sharp: '#' }[pitch.accidental]
    : '';

  return `${pitch.step}${accidental}${pitch.octave}`;
}

function findStaffAtY(
  score: Score,
  y: number,
  preferredStaffId?: StaffId | null,
) {
  const staves = score.parts[0]?.staves ?? [];
  const measureCount = staves[0]?.measures.length ?? 0;
  const systemCount = getScoreSystemCount(score);
  const isInsideGrandStaffDeadZone = (systemIndex: number) => {
    if (staves.length < 2) {
      return false;
    }

    for (let staffIndex = 0; staffIndex < staves.length - 1; staffIndex += 1) {
      const measureIndex = getScoreSystemMeasureIndexes(score, systemIndex)[0] ?? 0;
      const upperStaffBottom =
        getScoreStaffTop(score, staffIndex, measureIndex) + STAFF_LINE_SPACING * 4;
      const lowerStaffTop = getScoreStaffTop(
        score,
        staffIndex + 1,
        measureIndex,
      );
      const interStaffGap = lowerStaffTop - upperStaffBottom;
      const deadZoneHeight = Math.min(
        GRAND_STAFF_DEAD_ZONE_HEIGHT,
        Math.max(0, interStaffGap),
      );
      const deadZoneCenter = (upperStaffBottom + lowerStaffTop) / 2;
      const deadZoneTop = deadZoneCenter - deadZoneHeight / 2;
      const deadZoneBottom = deadZoneCenter + deadZoneHeight / 2;

      if (deadZoneTop < deadZoneBottom && y > deadZoneTop && y < deadZoneBottom) {
        return true;
      }
    }

    return false;
  };
  const candidates = staves
    .flatMap((staff, staffIndex) =>
      Array.from({ length: systemCount }, (_, systemIndex) => {
        const measureIndex = getScoreSystemMeasureIndexes(score, systemIndex)[0] ?? 0;
        const staffTop = getScoreStaffTop(score, staffIndex, measureIndex);
        const staffBottom = staffTop + STAFF_LINE_SPACING * 4;
        const staffCenter = staffTop + STAFF_LINE_SPACING * 2;
        const isInDeadZone = isInsideGrandStaffDeadZone(systemIndex);
        const isGrandStaffPair = staves.length === 2;
        const isPreferredStaff = staff.id === preferredStaffId;
        const upperPadding =
          isGrandStaffPair && !isPreferredStaff && staffIndex > 0
            ? GRAND_STAFF_BOTTOM_INNER_PADDING
            : STAFF_VERTICAL_PADDING;
        const lowerPadding =
          isGrandStaffPair && !isPreferredStaff && staffIndex === 0
            ? GRAND_STAFF_TOP_INNER_PADDING
            : STAFF_VERTICAL_PADDING;
        const corePadding = isGrandStaffPair
          ? GRAND_STAFF_CORE_SWITCH_PADDING
          : STAFF_VERTICAL_PADDING;

        return {
          distance: Math.abs(y - staffCenter),
          isInsideCoreBand:
            !isInDeadZone &&
            y >= staffTop - corePadding &&
            y <= staffBottom + corePadding,
          isInsideEditableBand:
            !isInDeadZone &&
            y >= staffTop - upperPadding &&
            y <= staffBottom + lowerPadding,
          staff,
          systemIndex,
        };
      }),
    )
    .filter((candidate) => candidate.isInsideEditableBand)
    .sort((a, b) => a.distance - b.distance);

  if (preferredStaffId) {
    const preferredCandidate = candidates.find(
      (candidate) => candidate.staff.id === preferredStaffId,
    );
    const coreSwitchCandidate = candidates.find(
      (candidate) =>
        candidate.staff.id !== preferredStaffId && candidate.isInsideCoreBand,
    );

    if (preferredCandidate?.isInsideCoreBand) {
      return preferredCandidate;
    }

    if (coreSwitchCandidate) {
      return coreSwitchCandidate;
    }

    if (preferredCandidate) {
      return preferredCandidate;
    }
  }

  return candidates[0];
}

function findMeasureIndexAtX(
  score: Score,
  systemIndex: number,
  measureCount: number,
  x: number,
) {
  const systemMeasureIndexes = getScoreSystemMeasureIndexes(score, systemIndex);
  const systemMeasureCount = systemMeasureIndexes.length;
  const firstMeasureIndex = systemMeasureIndexes[0] ?? 0;

  for (let offset = 0; offset < systemMeasureCount; offset += 1) {
    const measureIndex = systemMeasureIndexes[offset] ?? firstMeasureIndex;

    if (x <= getMeasureRight(measureIndex, score)) {
      return measureIndex;
    }
  }

  return firstMeasureIndex + Math.max(0, systemMeasureCount - 1);
}

export function mapPointToMusicPosition(
  point: SvgPoint,
  score: Score,
  options: MusicPositionOptions = {},
): MusicPosition | null {
  const staves = score.parts[0]?.staves ?? [];
  const staffMatch = findStaffAtY(score, point.y, options.preferredStaffId);
  const staff = staffMatch?.staff;
  const measureCount = staff?.measures.length ?? 0;
  const systemIndex = staffMatch?.systemIndex ?? 0;
  const systemMeasureIndexes = getScoreSystemMeasureIndexes(score, systemIndex);
  const systemMeasureCount = systemMeasureIndexes.length;
  const firstMeasureIndex = systemMeasureIndexes[0] ?? 0;

  if (
    !staff ||
    systemMeasureCount === 0 ||
    point.x < STAFF_LEFT ||
    point.x > getStaffRight(measureCount, firstMeasureIndex, score)
  ) {
    return null;
  }

  const staffIndex = staves.indexOf(staff);
  const measureIndex = Math.min(
    measureCount - 1,
    Math.max(0, findMeasureIndexAtX(score, systemIndex, measureCount, point.x)),
  );
  const measureContentLeft = getMeasureContentLeft(measureIndex, score);
  const measureContentWidth = getMeasureContentWidth(measureIndex, score);
  const clampedContentX = Math.min(
    measureContentLeft + measureContentWidth,
    Math.max(measureContentLeft, point.x),
  );
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const rawBeat =
    ((clampedContentX - measureContentLeft) / measureContentWidth) *
    beatsPerMeasure;
  const beat = snapBeatToInputSlot(
    rawBeat,
    options.duration ?? 'eighth',
    beatsPerMeasure,
    options.dots ?? 0,
  );
  const pitch = mapScoreStaffYToPitch(
    point.y,
    staff.clef,
    staffIndex,
    score,
    measureIndex,
  );

  return {
    staffId: staff.id,
    staffIndex,
    measureIndex,
    beat,
    pitch,
    x: point.x,
    y: point.y,
  };
}
