import type { Pitch, Score, Staff, StaffId } from '../../domain/score/types';
import {
  TOP_LINE_BY_CLEF,
  clampPitchToClefRange,
  diatonicValueToPitch,
  pitchToDiatonicValue,
} from '../../domain/score/pitchRange';
import {
  MEASURES_PER_SYSTEM,
  STAFF_LEFT,
  STAFF_GAP,
  STAFF_LINE_SPACING,
  getMeasureContentLeft,
  getMeasureContentWidth,
  getMeasureCountForSystem,
  getMeasureRight,
  getScoreStaffGap,
  getScoreSystemGap,
  getStaffRight,
  getStaffTop,
} from './layout';

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

const SNAP_BEAT = 0.5;
const STAFF_VERTICAL_PADDING = 78;

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

export function formatPitch(pitch: Pitch) {
  const accidental = pitch.accidental
    ? { flat: 'b', natural: '', sharp: '#' }[pitch.accidental]
    : '';

  return `${pitch.step}${accidental}${pitch.octave}`;
}

function findStaffAtY(
  staves: Staff[],
  y: number,
  staffGap: number,
  systemGap: number,
) {
  const measureCount = staves[0]?.measures.length ?? 0;
  const systemCount = Math.max(1, Math.ceil(measureCount / MEASURES_PER_SYSTEM));
  const candidates = staves
    .flatMap((staff, staffIndex) =>
      Array.from({ length: systemCount }, (_, systemIndex) => {
        const measureIndex = systemIndex * MEASURES_PER_SYSTEM;
        const staffTop = getStaffTop(staffIndex, staffGap, measureIndex, systemGap);
        const staffBottom = staffTop + STAFF_LINE_SPACING * 4;
        const staffCenter = staffTop + STAFF_LINE_SPACING * 2;

        return {
          distance: Math.abs(y - staffCenter),
          isInsideEditableBand:
            y >= staffTop - STAFF_VERTICAL_PADDING &&
            y <= staffBottom + STAFF_VERTICAL_PADDING,
          staff,
          systemIndex,
        };
      }),
    )
    .filter((candidate) => candidate.isInsideEditableBand)
    .sort((a, b) => a.distance - b.distance);

  return candidates[0];
}

function findMeasureIndexAtX(
  score: Score,
  systemIndex: number,
  measureCount: number,
  x: number,
) {
  const systemMeasureCount = getMeasureCountForSystem(measureCount, systemIndex);
  const firstMeasureIndex = systemIndex * MEASURES_PER_SYSTEM;

  for (let offset = 0; offset < systemMeasureCount; offset += 1) {
    const measureIndex = firstMeasureIndex + offset;

    if (x <= getMeasureRight(measureIndex, score)) {
      return measureIndex;
    }
  }

  return firstMeasureIndex + Math.max(0, systemMeasureCount - 1);
}

export function mapPointToMusicPosition(
  point: SvgPoint,
  score: Score,
): MusicPosition | null {
  const staves = score.parts[0]?.staves ?? [];
  const staffGap = getScoreStaffGap(score);
  const systemGap = getScoreSystemGap(score);
  const staffMatch = findStaffAtY(staves, point.y, staffGap, systemGap);
  const staff = staffMatch?.staff;
  const measureCount = staff?.measures.length ?? 0;
  const systemIndex = staffMatch?.systemIndex ?? 0;
  const systemMeasureCount = getMeasureCountForSystem(measureCount, systemIndex);

  if (
    !staff ||
    systemMeasureCount === 0 ||
    point.x < STAFF_LEFT ||
    point.x > getStaffRight(measureCount, systemIndex * MEASURES_PER_SYSTEM, score)
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
  const rawBeat =
    ((clampedContentX - measureContentLeft) / measureContentWidth) *
    score.timeSignature.beats;
  const beat = Math.min(
    score.timeSignature.beats - SNAP_BEAT,
    Math.max(0, Math.round(rawBeat / SNAP_BEAT) * SNAP_BEAT),
  );
  const pitch = mapStaffYToPitch(
    point.y,
    staff.clef,
    staffIndex,
    staffGap,
    measureIndex,
    systemGap,
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
