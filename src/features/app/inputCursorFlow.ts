import { getMeasureBeats } from '../../domain/score/timeSignatures';
import { getDurationBeats } from '../../domain/score/durations';
import type {
  DurationValue,
  Pitch,
  Score,
} from '../../domain/score/types';
import type { InputCursor } from '../editor/inputCursor';
import { createInputCursorFromPosition } from '../editor/inputCursor';
import type { MusicPosition } from '../sheet/interaction';
import {
  findNextRhythmSlotAfter,
  findRhythmSlotAtBeat,
} from '../sheet/rhythmSlots';

const NEXT_SLOT_SEARCH_EPSILON = 0.0002;

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
  const placedSlot = findRhythmSlotAtBeat(
    score,
    placementPosition.staffId,
    placementPosition.measureIndex,
    placementPosition.beat,
    voiceIndex,
  );
  const durationEndBeat =
    placementPosition.beat + getDurationBeats(duration, dots);
  const placedEndBeat =
    placedSlot?.event?.tuplet ? placedSlot.endBeat : durationEndBeat;
  const beatsPerMeasure = getMeasureBeats(score.timeSignature);
  const fallbackGlobalBeat =
    placementPosition.measureIndex * beatsPerMeasure + placedEndBeat;
  const fallbackMeasureIndex = Math.floor(fallbackGlobalBeat / beatsPerMeasure);
  const fallbackBeat = Number((fallbackGlobalBeat % beatsPerMeasure).toFixed(4));
  const nextSlot = findNextRhythmSlotAfter(
    score,
    placementPosition.staffId,
    placementPosition.measureIndex,
    Math.max(placementPosition.beat, placedEndBeat - NEXT_SLOT_SEARCH_EPSILON),
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
        beat: fallbackBeat,
        clientX: undefined,
        clientY: undefined,
        measureIndex: fallbackMeasureIndex,
      };
  const nextDuration = nextSlot?.event?.tuplet ? nextSlot.duration : duration;
  const nextDots = nextSlot?.event?.tuplet ? nextSlot.dots ?? 0 : dots;
  const nextTuplet = nextSlot?.event?.tuplet;

  const cursor = createInputCursorFromPosition(
    nextPosition,
    nextDuration,
    'note-input',
    beatsPerMeasure,
    nextDots,
    nextTuplet,
  );

  return {
    ...cursor,
    beat: nextSlot?.beat ?? nextPosition.beat,
    measureIndex: nextSlot?.measureIndex ?? nextPosition.measureIndex,
  };
}
