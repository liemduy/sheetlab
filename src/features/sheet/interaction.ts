import type { Pitch, Score, Staff, StaffId } from '../../domain/score/types';
import {
  MEASURE_WIDTH,
  STAFF_LEFT,
  STAFF_LINE_SPACING,
  getMeasureContentLeft,
  getMeasureContentWidth,
  getStaffRight,
  getStaffTop,
} from './layout';

export interface SvgPoint {
  x: number;
  y: number;
}

export interface MusicPosition {
  staffId: StaffId;
  staffIndex: number;
  measureIndex: number;
  beat: number;
  pitch: Pitch;
  x: number;
  y: number;
}

const SNAP_BEAT = 0.5;
const STAFF_VERTICAL_PADDING = 22;
const NOTE_STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const TOP_LINE_BY_CLEF = {
  treble: { step: 'F', octave: 5 },
  bass: { step: 'A', octave: 3 },
} satisfies Record<Staff['clef'], Pitch>;

function pitchToDiatonicValue(pitch: Pitch) {
  return pitch.octave * NOTE_STEPS.length + NOTE_STEPS.indexOf(pitch.step);
}

function diatonicValueToPitch(value: number): Pitch {
  const stepCount = NOTE_STEPS.length;
  const stepIndex = ((value % stepCount) + stepCount) % stepCount;
  const octave = Math.floor((value - stepIndex) / stepCount);

  return {
    step: NOTE_STEPS[stepIndex],
    octave,
  };
}

export function formatPitch(pitch: Pitch) {
  const accidental = pitch.accidental
    ? { flat: 'b', natural: '', sharp: '#' }[pitch.accidental]
    : '';

  return `${pitch.step}${accidental}${pitch.octave}`;
}

function findStaffAtY(staves: Staff[], y: number) {
  return staves.find((_, staffIndex) => {
    const staffTop = getStaffTop(staffIndex);
    const staffBottom = staffTop + STAFF_LINE_SPACING * 4;

    return (
      y >= staffTop - STAFF_VERTICAL_PADDING &&
      y <= staffBottom + STAFF_VERTICAL_PADDING
    );
  });
}

export function mapPointToMusicPosition(
  point: SvgPoint,
  score: Score,
): MusicPosition | null {
  const staves = score.parts[0]?.staves ?? [];
  const staff = findStaffAtY(staves, point.y);
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
  const staffTop = getStaffTop(staffIndex);
  const diatonicOffset = Math.round(
    (staffTop - point.y) / (STAFF_LINE_SPACING / 2),
  );
  const pitch = diatonicValueToPitch(
    pitchToDiatonicValue(TOP_LINE_BY_CLEF[staff.clef]) + diatonicOffset,
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
