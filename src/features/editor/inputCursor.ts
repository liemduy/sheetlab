import { getDurationBeats } from '../../domain/score/durations';
import type { DurationValue, Pitch, Score, StaffId } from '../../domain/score/types';
import type { MusicPosition } from '../sheet/interaction';
import { formatPitch } from '../sheet/interaction';

export type InputCursorMode = 'note-input' | 'select' | 'delete-hover';

export interface InputCursor {
  beat: number;
  dots?: number;
  duration: DurationValue;
  measureIndex: number;
  mode: InputCursorMode;
  pitchPreview: Pitch;
  staffId: StaffId;
  staffIndex: number;
}

function roundBeat(beat: number) {
  return Number(beat.toFixed(4));
}

function getMeasureCount(score: Score, staffId: StaffId) {
  return (
    score.parts
      .flatMap((part) => part.staves)
      .find((staff) => staff.id === staffId)?.measures.length ?? 0
  );
}

export function createInputCursorFromPosition(
  position: MusicPosition,
  duration: DurationValue,
  mode: InputCursorMode = 'note-input',
  beatsPerMeasure = 4,
  dots = 0,
): InputCursor {
  return {
    beat: snapBeatToInputSlot(position.beat, duration, beatsPerMeasure, dots),
    dots,
    duration,
    measureIndex: position.measureIndex,
    mode,
    pitchPreview: position.pitch,
    staffId: position.staffId,
    staffIndex: position.staffIndex,
  };
}

export function advanceInputCursor(score: Score, cursor: InputCursor): InputCursor {
  const beatsPerMeasure = score.timeSignature.beats;
  const durationBeats = getDurationBeats(cursor.duration, cursor.dots ?? 0);
  const globalBeat =
    cursor.measureIndex * beatsPerMeasure + cursor.beat + durationBeats;
  const measureCount = getMeasureCount(score, cursor.staffId);
  const targetMeasureIndex = Math.floor(globalBeat / beatsPerMeasure);
  const nextMeasureIndex = Math.min(
    Math.max(0, measureCount - 1),
    targetMeasureIndex,
  );
  const nextBeat =
    targetMeasureIndex >= measureCount
      ? Math.max(0, beatsPerMeasure - durationBeats)
      : globalBeat % beatsPerMeasure;

  return {
    ...cursor,
    beat: roundBeat(nextBeat),
    measureIndex: nextMeasureIndex,
    mode: 'note-input',
  };
}

export function updateInputCursorDuration(
  cursor: InputCursor | null,
  duration: DurationValue,
  beatsPerMeasure = 4,
  dots = cursor?.dots ?? 0,
) {
  return cursor
    ? {
        ...cursor,
        beat: snapBeatToInputSlot(cursor.beat, duration, beatsPerMeasure, dots),
        dots,
        duration,
      }
    : null;
}

export function getInputSlotBeats(
  duration: DurationValue,
  beatsPerMeasure: number,
  dots = 0,
) {
  const durationBeats = getDurationBeats(duration, dots);
  const slotCount = Math.max(1, Math.floor(beatsPerMeasure / durationBeats));

  return Array.from({ length: slotCount }, (_, slotIndex) =>
    roundBeat(slotIndex * durationBeats),
  );
}

export function snapBeatToInputSlot(
  beat: number,
  duration: DurationValue,
  beatsPerMeasure: number,
  dots = 0,
) {
  const durationBeats = getDurationBeats(duration, dots);
  const maxBeat = Math.max(0, beatsPerMeasure - durationBeats);
  const snappedBeat = Math.round(beat / durationBeats) * durationBeats;

  return roundBeat(Math.min(maxBeat, Math.max(0, snappedBeat)));
}

export function formatInputCursor(cursor: InputCursor | null) {
  if (!cursor) {
    return 'None';
  }

  return `${cursor.staffId} M${cursor.measureIndex + 1} B${
    cursor.beat + 1
  } ${formatPitch(cursor.pitchPreview)}`;
}
