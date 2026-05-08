import { isPitchedScoreEvent } from '../../domain/score/events';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import type {
  DurationValue,
  Pitch,
  Score,
} from '../../domain/score/types';
import type { InputCursor } from '../editor/inputCursor';
import { createInputCursorFromPosition } from '../editor/inputCursor';
import type { MusicPosition } from '../sheet/interaction';
import { findNextRhythmSlotAfter } from '../sheet/rhythmSlots';

export function pitchesMatch(first: Pitch, second: Pitch) {
  return (
    first.step === second.step &&
    first.octave === second.octave &&
    first.accidental === second.accidental
  );
}

export function musicPositionFromCursor(
  cursor: InputCursor,
  pointerPosition: MusicPosition,
): MusicPosition {
  return {
    ...pointerPosition,
    beat: cursor.beat,
    measureIndex: cursor.measureIndex,
    pitch: pointerPosition.pitch,
    staffId: cursor.staffId,
    staffIndex: cursor.staffIndex,
  };
}

export function hasPitchedEventAtPosition(score: Score, position: MusicPosition) {
  const voice = score.parts
    .flatMap((part) => part.staves)
    .find((staff) => staff.id === position.staffId)
    ?.measures.find((measure) => measure.index === position.measureIndex)
    ?.voices[0];

  return (
    voice?.events.some(
      (event) => isPitchedScoreEvent(event) && event.beat === position.beat,
    ) ?? false
  );
}

const SEQUENTIAL_CLICK_CLIENT_RADIUS = 32;

function isNearSequentialCursor(cursor: InputCursor, position: MusicPosition) {
  if (cursor.clientX === undefined || position.clientX === undefined) {
    return false;
  }

  return (
    Math.abs(position.clientX - cursor.clientX) <=
    SEQUENTIAL_CLICK_CLIENT_RADIUS
  );
}

export function shouldUseSequentialCursor(
  cursor: InputCursor,
  isSequenceLocked: boolean,
  position: MusicPosition,
) {
  return (
    isSequenceLocked &&
    cursor.mode === 'note-input' &&
    cursor.staffId === position.staffId &&
    (cursor.measureIndex === position.measureIndex ||
      isNearSequentialCursor(cursor, position))
  );
}

export function createCursorAfterPlacement(
  score: Score,
  placementPosition: MusicPosition,
  duration: DurationValue,
  dots: number,
) {
  const nextSlot = findNextRhythmSlotAfter(
    score,
    placementPosition.staffId,
    placementPosition.measureIndex,
    placementPosition.beat,
  );
  const nextPosition = nextSlot
    ? {
        ...placementPosition,
        beat: nextSlot.beat,
        clientX: undefined,
        clientY: undefined,
        measureIndex: nextSlot.measureIndex,
      }
    : {
        ...placementPosition,
        clientX: undefined,
        clientY: undefined,
      };

  return createInputCursorFromPosition(
    nextPosition,
    duration,
    'note-input',
    getMeasureBeats(score.timeSignature),
    dots,
  );
}
