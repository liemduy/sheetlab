import type { Pitch, Score, Staff, StaffId } from '../../domain/score/types';
import {
  TOP_LINE_BY_CLEF,
  clampPitchToClefRange,
  diatonicValueToPitch,
  pitchToDiatonicValue,
} from '../../domain/score/pitchRange';
import {
  MEASURE_WIDTH,
  STAFF_LEFT,
  STAFF_GAP,
  STAFF_LINE_SPACING,
  getMeasureContentLeft,
  getMeasureContentWidth,
  getScoreStaffGap,
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
) {
  const staffTop = getStaffTop(staffIndex, staffGap);
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

function findStaffAtY(staves: Staff[], y: number, staffGap: number) {
  const candidates = staves
    .map((staff, staffIndex) => {
      const staffTop = getStaffTop(staffIndex, staffGap);
      const staffBottom = staffTop + STAFF_LINE_SPACING * 4;
      const staffCenter = staffTop + STAFF_LINE_SPACING * 2;

      return {
        distance: Math.abs(y - staffCenter),
        isInsideEditableBand:
          y >= staffTop - STAFF_VERTICAL_PADDING &&
          y <= staffBottom + STAFF_VERTICAL_PADDING,
        staff,
      };
    })
    .filter((candidate) => candidate.isInsideEditableBand)
    .sort((a, b) => a.distance - b.distance);

  return candidates[0]?.staff;
}

export function mapPointToMusicPosition(
  point: SvgPoint,
  score: Score,
): MusicPosition | null {
  const staves = score.parts[0]?.staves ?? [];
  const staffGap = getScoreStaffGap(score);
  const staff = findStaffAtY(staves, point.y, staffGap);
  const measureCount = staff?.measures.length ?? 0;

  if (!staff || point.x < STAFF_LEFT || point.x > getStaffRight(measureCount)) {
    return null;
  }

  const staffIndex = staves.indexOf(staff);
  const measureIndex = Math.min(
    measureCount - 1,
    Math.max(0, Math.floor((point.x - STAFF_LEFT) / MEASURE_WIDTH)),
  );
  const measureContentLeft = getMeasureContentLeft(measureIndex);
  const measureContentWidth = getMeasureContentWidth(measureIndex);
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
  const pitch = mapStaffYToPitch(point.y, staff.clef, staffIndex, staffGap);

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
