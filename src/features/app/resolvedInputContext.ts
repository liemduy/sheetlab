import type { Score, TupletInfo } from '../../domain/score/types';
import type { EditorToolState } from '../editor/editorState';
import { createInputCursorFromPosition } from '../editor/inputCursor';
import type { InputCursor } from '../editor/inputCursor';
import type { MusicPosition } from '../sheet/interaction';
import {
  findRhythmSlotAtBeat,
  findRhythmSlotAtPosition,
  getRhythmSlotsForMeasure,
  type RhythmSlot,
} from '../sheet/rhythmSlots';
import { getMeasureBeats } from '../../domain/score/timeSignatures';

const SLOT_MATCH_EPSILON = 0.0001;

export type ResolvedInputMode =
  | 'create-tuplet-group'
  | 'existing-rhythm-slot'
  | 'existing-tuplet-slot'
  | 'input-grid';

export interface ResolvedInputContext {
  cursor: InputCursor;
  cursorPosition: MusicPosition;
  dots: number;
  duration: EditorToolState['duration'];
  isExistingTupletSlot: boolean;
  mode: ResolvedInputMode;
  position: MusicPosition;
  targetSlot: RhythmSlot | null;
  tuplet: TupletInfo | undefined;
}

export function resolveInputContext({
  position,
  score,
  toolState,
}: {
  position: MusicPosition;
  score: Score;
  toolState: EditorToolState;
}): ResolvedInputContext {
  const exactBeatSlot = getRhythmSlotsForMeasure(
    score,
    position.staffId,
    position.measureIndex,
    toolState.voiceIndex,
  ).find((slot) => Math.abs(slot.beat - position.beat) <= SLOT_MATCH_EPSILON);
  const targetSlot =
    exactBeatSlot ??
    findRhythmSlotAtPosition(
      score,
      position,
      toolState.voiceIndex,
    ) ??
    findRhythmSlotAtBeat(
      score,
      position.staffId,
      position.measureIndex,
      position.beat,
      toolState.voiceIndex,
    );
  const isExactTargetSlot =
    Boolean(targetSlot) &&
    Math.abs((targetSlot?.beat ?? 0) - position.beat) <= SLOT_MATCH_EPSILON;
  const isExistingTupletSlot = Boolean(targetSlot?.event?.tuplet);
  const shouldLockToSlot = Boolean(
    targetSlot?.event && (isExistingTupletSlot || isExactTargetSlot),
  );
  const duration =
    isExistingTupletSlot && targetSlot ? targetSlot.duration : toolState.duration;
  const dots =
    isExistingTupletSlot && targetSlot ? targetSlot.dots ?? 0 : toolState.dots;
  const tuplet = isExistingTupletSlot ? targetSlot?.event?.tuplet : undefined;
  const cursorPosition = shouldLockToSlot && targetSlot
    ? {
        ...position,
        beat: targetSlot.beat,
      }
    : position;
  const cursor = createInputCursorFromPosition(
    cursorPosition,
    duration,
    'note-input',
    getMeasureBeats(score.timeSignature),
    dots,
    tuplet,
  );
  const lockedCursor = shouldLockToSlot && targetSlot
    ? {
        ...cursor,
        beat: targetSlot.beat,
      }
    : cursor;
  const mode: ResolvedInputMode = isExistingTupletSlot
    ? 'existing-tuplet-slot'
    : toolState.tuplet
      ? 'create-tuplet-group'
      : targetSlot?.event && isExactTargetSlot
        ? 'existing-rhythm-slot'
        : 'input-grid';

  return {
    cursor: lockedCursor,
    cursorPosition,
    dots,
    duration,
    isExistingTupletSlot,
    mode,
    position,
    targetSlot,
    tuplet,
  };
}
