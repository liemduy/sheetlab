import type { Score } from '../../domain/score/types';
import type { DurationValue } from '../../domain/score/types';
import { getMeasureBeats } from '../../domain/score/timeSignatures';
import type { InputCursor } from '../editor/inputCursor';
import { createInputCursorFromPosition } from '../editor/inputCursor';
import type { MusicPosition } from './interaction';
import {
  STAFF_LINE_SPACING,
  getScoreStaffTop,
} from './layout';
import { getBeatX, getPitchYForScore } from './notationGeometry';
import type { RenderedEventLayout } from './renderedEventLayout';
import {
  getRhythmSlotsForMeasure,
  snapPositionToRhythmSlot,
} from './rhythmSlots';

const BEAT_MATCH_EPSILON = 0.0001;

export function inputCursorToMusicPosition(
  cursor: InputCursor | null | undefined,
  score: Score,
): MusicPosition | null {
  if (!cursor) {
    return null;
  }

  const staff = score.parts[0]?.staves[cursor.staffIndex];

  if (!staff || staff.id !== cursor.staffId) {
    return null;
  }

  const x = getBeatX(
    cursor.measureIndex,
    cursor.beat,
    getMeasureBeats(score.timeSignature),
    score,
  );
  const y =
    cursor.mode === 'note-input'
      ? getPitchYForScore(
          cursor.pitchPreview,
          staff.clef,
          cursor.staffIndex,
          score,
          cursor.measureIndex,
        )
      : getScoreStaffTop(score, cursor.staffIndex, cursor.measureIndex) +
        STAFF_LINE_SPACING * 2;

  return {
    beat: cursor.beat,
    clientX: cursor.clientX,
    clientY: cursor.clientY,
    measureIndex: cursor.measureIndex,
    pitch: cursor.pitchPreview,
    staffId: cursor.staffId,
    staffIndex: cursor.staffIndex,
    x,
    y,
  };
}

export function snapPositionToInputGrid(
  position: MusicPosition,
  duration: DurationValue,
  dots: number,
  score: Score,
  eventLayouts: Record<string, RenderedEventLayout> = {},
  voiceIndex = 0,
) {
  const rhythmSlotPosition = snapPositionToRhythmSlot(score, position, voiceIndex);
  const snappedPosition =
    inputCursorToMusicPosition(
      createInputCursorFromPosition(
        rhythmSlotPosition,
        duration,
        'note-input',
        getMeasureBeats(score.timeSignature),
        dots,
      ),
      score,
    ) ?? rhythmSlotPosition;
  const activeSlot = getRhythmSlotsForMeasure(
    score,
    snappedPosition.staffId,
    snappedPosition.measureIndex,
    voiceIndex,
  ).find((slot) => Math.abs(slot.beat - snappedPosition.beat) <= BEAT_MATCH_EPSILON);
  const activeSlotLayout = activeSlot ? eventLayouts[activeSlot.eventId] : undefined;

  return activeSlotLayout
    ? {
        ...snappedPosition,
        x: activeSlotLayout.x,
      }
    : snappedPosition;
}
