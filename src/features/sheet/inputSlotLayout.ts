import { getDurationBeats } from '../../domain/score/durations';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import type { Score, ScoreEvent } from '../../domain/score/types';
import type { InputCursor } from '../editor/inputCursor';
import {
  getScoreStaffGap,
  getScoreSystemGap,
  getStaffTop,
  STAFF_LINE_SPACING,
} from './layout';
import { getBeatX, getPitchY } from './notationGeometry';
import { getLedgerLineYs } from './notationGlyph';
import { getRhythmSlotsForMeasure } from './rhythmSlots';

export const DEFAULT_INPUT_SLOT_WIDTH = 32;
export const MIN_INPUT_SLOT_WIDTH = 28;
const STAFF_SLOT_PADDING_Y = 16;
const NOTEHEAD_VERTICAL_RADIUS = 5.2;
const LEDGER_LINE_PADDING_Y = 4;
const PITCH_PREVIEW_PADDING_Y = 8;
const BEAT_MATCH_EPSILON = 0.0001;

export interface InputSlotEventLayout {
  beat: number;
  isGeneratedRest: boolean;
  kind: ScoreEvent['kind'];
  maxX: number;
  measureIndex: number;
  minX: number;
  staffId: string;
  x: number;
}

export interface InputSlotLayout {
  boxWidth: number;
  boxX: number;
  centerX: number;
  height: number;
  layoutSource: 'beat-grid' | 'vexflow';
  slotEndBeat: number;
  y: number;
}

function getStaffSlotYRange(
  score: Score,
  cursor: InputCursor,
  includePitchPreview: boolean,
) {
  const { measureIndex, staffIndex } = cursor;
  const staffGap = getScoreStaffGap(score);
  const systemGap = getScoreSystemGap(score);
  const staffTop = getStaffTop(
    staffIndex,
    staffGap,
    measureIndex,
    systemGap,
  );
  const baseRange = {
    y1: staffTop - STAFF_SLOT_PADDING_Y,
    y2: staffTop + STAFF_LINE_SPACING * 4 + STAFF_SLOT_PADDING_Y,
  };

  if (!includePitchPreview) {
    return baseRange;
  }

  const staff = score.parts[0]?.staves[staffIndex];

  if (!staff) {
    return baseRange;
  }

  const pitchY = getPitchY(
    cursor.pitchPreview,
    staff.clef,
    staffIndex,
    staffGap,
    measureIndex,
    systemGap,
  );
  const ledgerYs = getLedgerLineYs(
    pitchY,
    staffIndex,
    staffGap,
    measureIndex,
    systemGap,
  );
  const ledgerTop = ledgerYs.length
    ? Math.min(...ledgerYs) - LEDGER_LINE_PADDING_Y
    : pitchY;
  const ledgerBottom = ledgerYs.length
    ? Math.max(...ledgerYs) + LEDGER_LINE_PADDING_Y
    : pitchY;

  return {
    y1: Math.min(
      baseRange.y1,
      pitchY - NOTEHEAD_VERTICAL_RADIUS - PITCH_PREVIEW_PADDING_Y,
      ledgerTop,
    ),
    y2: Math.max(
      baseRange.y2,
      pitchY + NOTEHEAD_VERTICAL_RADIUS + PITCH_PREVIEW_PADDING_Y,
      ledgerBottom,
    ),
  };
}

function getActiveSlotLayout(
  cursor: InputCursor,
  eventLayouts: Record<string, InputSlotEventLayout>,
  score: Score,
  voiceIndex = 0,
) {
  const activeSlot = getRhythmSlotsForMeasure(
    score,
    cursor.staffId,
    cursor.measureIndex,
    voiceIndex,
  ).find((slot) => Math.abs(slot.beat - cursor.beat) <= BEAT_MATCH_EPSILON);
  const activeSlotLayout = activeSlot
    ? eventLayouts[activeSlot.eventId]
    : undefined;

  return activeSlotLayout;
}

export function getInputSlotLayout({
  cursor,
  eventLayouts = {},
  includePitchPreview = true,
  score,
  voiceIndex = 0,
}: {
  cursor: InputCursor;
  eventLayouts?: Record<string, InputSlotEventLayout>;
  includePitchPreview?: boolean;
  score: Score;
  voiceIndex?: number;
}): InputSlotLayout {
  const activeSlotLayout = getActiveSlotLayout(
    cursor,
    eventLayouts,
    score,
    voiceIndex,
  );
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const centerX =
    activeSlotLayout?.x ??
    getBeatX(
      cursor.measureIndex,
      cursor.beat,
      beatsPerMeasure,
      score,
    );
  const boxWidth = DEFAULT_INPUT_SLOT_WIDTH;
  const yRange = getStaffSlotYRange(
    score,
    cursor,
    includePitchPreview,
  );
  const slotEndBeat = Math.min(
    beatsPerMeasure,
    cursor.beat + getDurationBeats(cursor.duration, cursor.dots ?? 0),
  );

  return {
    boxWidth,
    boxX: centerX - boxWidth / 2,
    centerX,
    height: yRange.y2 - yRange.y1,
    layoutSource: activeSlotLayout ? 'vexflow' : 'beat-grid',
    slotEndBeat,
    y: yRange.y1,
  };
}
