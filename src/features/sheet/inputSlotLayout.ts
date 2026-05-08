import { getDurationBeats } from '../../domain/score/durations';
import type { Score, ScoreEvent } from '../../domain/score/types';
import type { InputCursor } from '../editor/inputCursor';
import {
  getScoreStaffGap,
  getScoreSystemGap,
  getStaffTop,
  STAFF_LINE_SPACING,
} from './layout';
import { getBeatX } from './notationGeometry';
import { getRhythmSlotsForMeasure } from './rhythmSlots';

export const DEFAULT_INPUT_SLOT_WIDTH = 32;
export const MIN_INPUT_SLOT_WIDTH = 28;
const EVENT_SLOT_PADDING_X = 8;
const STAFF_SLOT_PADDING_Y = 16;
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
  staffIndex: number,
  measureIndex: number,
) {
  const staffGap = getScoreStaffGap(score);
  const systemGap = getScoreSystemGap(score);
  const staffTop = getStaffTop(
    staffIndex,
    staffGap,
    measureIndex,
    systemGap,
  );

  return {
    y1: staffTop - STAFF_SLOT_PADDING_Y,
    y2: staffTop + STAFF_LINE_SPACING * 4 + STAFF_SLOT_PADDING_Y,
  };
}

function getVisibleSlotLayout(
  cursor: InputCursor,
  eventLayouts: Record<string, InputSlotEventLayout>,
  score: Score,
) {
  const activeSlot = getRhythmSlotsForMeasure(
    score,
    cursor.staffId,
    cursor.measureIndex,
  ).find((slot) => Math.abs(slot.beat - cursor.beat) <= BEAT_MATCH_EPSILON);
  const activeSlotLayout = activeSlot
    ? eventLayouts[activeSlot.eventId]
    : undefined;

  return activeSlotLayout &&
    activeSlotLayout.kind !== 'rest' &&
    !activeSlotLayout.isGeneratedRest
    ? activeSlotLayout
    : undefined;
}

export function getInputSlotLayout({
  cursor,
  eventLayouts = {},
  score,
}: {
  cursor: InputCursor;
  eventLayouts?: Record<string, InputSlotEventLayout>;
  score: Score;
}): InputSlotLayout {
  const visibleSlotLayout = getVisibleSlotLayout(cursor, eventLayouts, score);
  const centerX =
    visibleSlotLayout?.x ??
    getBeatX(
      cursor.measureIndex,
      cursor.beat,
      score.timeSignature.beats,
      score,
    );
  const eventWidth = visibleSlotLayout
    ? visibleSlotLayout.maxX - visibleSlotLayout.minX + EVENT_SLOT_PADDING_X * 2
    : DEFAULT_INPUT_SLOT_WIDTH;
  const boxWidth = Math.max(MIN_INPUT_SLOT_WIDTH, eventWidth);
  const yRange = getStaffSlotYRange(
    score,
    cursor.staffIndex,
    cursor.measureIndex,
  );
  const slotEndBeat = Math.min(
    score.timeSignature.beats,
    cursor.beat + getDurationBeats(cursor.duration, cursor.dots ?? 0),
  );

  return {
    boxWidth,
    boxX: centerX - boxWidth / 2,
    centerX,
    height: yRange.y2 - yRange.y1,
    layoutSource: visibleSlotLayout ? 'vexflow' : 'beat-grid',
    slotEndBeat,
    y: yRange.y1,
  };
}
