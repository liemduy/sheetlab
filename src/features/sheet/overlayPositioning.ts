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
  findRhythmSlotAtPosition,
  getRhythmSlotsForMeasure,
} from './rhythmSlots';

const BEAT_MATCH_EPSILON = 0.0001;

function findRenderedRhythmSlotAtPosition(
  position: MusicPosition,
  score: Score,
  eventLayouts: Record<string, RenderedEventLayout>,
  voiceIndex: number,
) {
  const slotsWithLayouts = getRhythmSlotsForMeasure(
    score,
    position.staffId,
    position.measureIndex,
    voiceIndex,
  )
    .map((slot) => ({
      layout: eventLayouts[slot.eventId],
      slot,
    }))
    .filter(
      (entry): entry is {
        layout: RenderedEventLayout;
        slot: ReturnType<typeof getRhythmSlotsForMeasure>[number];
      } =>
        Boolean(entry.layout) &&
        Boolean(entry.slot.event?.tuplet) &&
        entry.layout.staffId === position.staffId &&
        entry.layout.measureIndex === position.measureIndex &&
        entry.layout.voiceIndex === voiceIndex,
    )
    .sort((a, b) => a.layout.x - b.layout.x);

  if (slotsWithLayouts.length === 0) {
    return null;
  }

  return slotsWithLayouts.find((entry, index) => {
    const previous = slotsWithLayouts[index - 1];
    const next = slotsWithLayouts[index + 1];
    const leftBoundary = previous
      ? (previous.layout.x + entry.layout.x) / 2
      : entry.layout.minX - 24;
    const rightBoundary = next
      ? (entry.layout.x + next.layout.x) / 2
      : entry.layout.maxX + 24;

    return position.x >= leftBoundary && position.x < rightBoundary;
  })?.slot ?? null;
}

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
  const activeSlot =
    findRenderedRhythmSlotAtPosition(position, score, eventLayouts, voiceIndex) ??
    findRhythmSlotAtPosition(score, position, voiceIndex);
  const activeSlotLayout = activeSlot ? eventLayouts[activeSlot.eventId] : undefined;
  const rhythmSlotPosition = activeSlot
    ? {
        ...position,
        beat: activeSlot.beat,
      }
    : position;
  const cursorDuration = activeSlot?.event?.tuplet
    ? activeSlot.duration
    : duration;
  const cursorDots = activeSlot?.event?.tuplet ? activeSlot.dots ?? 0 : dots;
  const snappedPosition =
    inputCursorToMusicPosition(
      createInputCursorFromPosition(
        rhythmSlotPosition,
        cursorDuration,
        'note-input',
        getMeasureBeats(score.timeSignature),
        cursorDots,
        activeSlot?.event?.tuplet,
      ),
      score,
    ) ?? rhythmSlotPosition;
  const snappedSlot = activeSlot?.event?.tuplet
    ? activeSlot
    : getRhythmSlotsForMeasure(
      score,
      snappedPosition.staffId,
      snappedPosition.measureIndex,
      voiceIndex,
    ).find((slot) => Math.abs(slot.beat - snappedPosition.beat) <= BEAT_MATCH_EPSILON);
  const snappedSlotLayout = snappedSlot ? eventLayouts[snappedSlot.eventId] : undefined;

  return snappedSlotLayout
    ? {
        ...snappedPosition,
        beat: snappedSlot?.event?.tuplet
          ? snappedSlot.beat
          : snappedPosition.beat,
        x: snappedSlotLayout.x,
      }
    : snappedPosition;
}
