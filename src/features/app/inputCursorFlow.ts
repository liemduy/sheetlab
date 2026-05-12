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

export function createCursorAfterPlacement(
  score: Score,
  placementPosition: MusicPosition,
  duration: DurationValue,
  dots: number,
  voiceIndex = 0,
) {
  const nextSlot = findNextRhythmSlotAfter(
    score,
    placementPosition.staffId,
    placementPosition.measureIndex,
    placementPosition.beat,
    voiceIndex,
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
  const nextDuration = nextSlot?.event?.tuplet ? nextSlot.duration : duration;
  const nextDots = nextSlot?.event?.tuplet ? nextSlot.dots ?? 0 : dots;
  const nextTuplet = nextSlot?.event?.tuplet;

  const cursor = createInputCursorFromPosition(
    nextPosition,
    nextDuration,
    'note-input',
    getMeasureBeats(score.timeSignature),
    nextDots,
    nextTuplet,
  );

  return nextSlot?.event?.tuplet
    ? {
        ...cursor,
        beat: nextSlot.beat,
      }
    : cursor;
}
